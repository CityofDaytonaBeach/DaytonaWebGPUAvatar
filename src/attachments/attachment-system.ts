import { buildBoneMatrices, combinedSkinMatrices } from '../anatomy/skeleton/bone-matrix.js';
import { BoneDef } from '../anatomy/skeleton/skeleton.js';
import { BonePose } from '../animation/skeleton/skeletal-animation.js';
import { CharacterEvent } from '../core/events/character-event.js';
import { Vec3, vec3 } from '../core/math/vec.js';
import { CanonicalHuman, RegionName } from '../geometry/canonical/canonical-human.js';

export type AttachmentKind = 'wearable' | 'tattoo' | 'piercing' | 'generic';

export interface AttachmentAnchor {
  /** Semantic surface/region anchor; survives topology-preserving edits. */
  region?: RegionName;
  /** Bone-space anchor for objects that should follow articulation directly. */
  bone?: string;
  /** Local offset in meters from the resolved region centroid or bone origin. */
  localPosition?: Vec3;
}

export interface HumanAttachment {
  id: string;
  kind: AttachmentKind;
  anchor: AttachmentAnchor;
  data?: Record<string, unknown>;
}

export class AttachmentSystem {
  private readonly byId = new Map<string, HumanAttachment>();

  add(attachment: HumanAttachment): void {
    if (!attachment.id) throw new Error('Attachment id is required');
    if (!attachment.anchor.region && !attachment.anchor.bone) {
      throw new Error('Attachment anchor requires a region or bone');
    }
    this.byId.set(attachment.id, cloneAttachment(attachment));
  }

  remove(id: string): boolean {
    return this.byId.delete(id);
  }

  get(id: string): HumanAttachment | null {
    const attachment = this.byId.get(id);
    return attachment ? cloneAttachment(attachment) : null;
  }

  list(): HumanAttachment[] {
    return [...this.byId.values()].map(cloneAttachment);
  }

  clear(): void {
    this.byId.clear();
  }

  rebuild(events: ReadonlyArray<CharacterEvent>): void {
    this.clear();
    for (const event of events) this.applyEvent(event);
  }

  applyEvent(event: CharacterEvent): void {
    if (event.type === 'wear' || event.type === 'addTattoo') {
      const attachment = event.payload?.attachment as HumanAttachment | undefined;
      if (attachment) this.add(attachment);
    }
    if (event.type === 'removeAttachment' && typeof event.payload?.id === 'string') {
      this.remove(event.payload.id);
    }
  }

  resolve(
    attachment: HumanAttachment,
    canonical: CanonicalHuman,
    skeleton: BoneDef[],
    poses: BonePose[] = [],
    morphDelta?: Float32Array,
  ): Vec3 {
    const offset = attachment.anchor.localPosition ?? vec3();
    if (attachment.anchor.bone) {
      return transformBoneLocal(attachment.anchor.bone, offset, skeleton, poses);
    }

    const region = attachment.anchor.region;
    if (!region) return offset;
    const base = regionCentroid(canonical, region, morphDelta);
    const skinned = transformByDominantRegionBone(base, canonical, region, skeleton, poses);
    return vec3(skinned.x + offset.x, skinned.y + offset.y, skinned.z + offset.z);
  }
}

function cloneAttachment(attachment: HumanAttachment): HumanAttachment {
  return {
    id: attachment.id,
    kind: attachment.kind,
    anchor: {
      region: attachment.anchor.region,
      bone: attachment.anchor.bone,
      localPosition: attachment.anchor.localPosition
        ? { ...attachment.anchor.localPosition }
        : undefined,
    },
    data: attachment.data ? { ...attachment.data } : undefined,
  };
}

function regionCentroid(
  canonical: CanonicalHuman,
  region: RegionName,
  morphDelta?: Float32Array,
): Vec3 {
  let x = 0,
    y = 0,
    z = 0,
    count = 0;
  for (const v of canonical.vertices) {
    if (v.region !== region) continue;
    const i = v.id * 3;
    x += v.position.x + (morphDelta?.[i] ?? 0);
    y += v.position.y + (morphDelta?.[i + 1] ?? 0);
    z += v.position.z + (morphDelta?.[i + 2] ?? 0);
    count++;
  }
  if (count === 0) throw new Error(`Unknown attachment region: ${region}`);
  return vec3(x / count, y / count, z / count);
}

function transformBoneLocal(
  bone: string,
  local: Vec3,
  skeleton: BoneDef[],
  poses: BonePose[],
): Vec3 {
  const index = skeleton.findIndex((b) => b.name === bone);
  if (index < 0) throw new Error(`Unknown attachment bone: ${bone}`);
  const current = buildBoneMatrices(skeleton, poses).current.subarray(index * 16, index * 16 + 16);
  return transformPoint(current, local);
}

function transformByDominantRegionBone(
  p: Vec3,
  canonical: CanonicalHuman,
  region: RegionName,
  skeleton: BoneDef[],
  poses: BonePose[],
): Vec3 {
  const bone = dominantRegionBone(canonical, region);
  const index = skeleton.findIndex((b) => b.name === bone);
  if (index < 0) return p;
  const skin = combinedSkinMatrices(skeleton, poses).subarray(index * 16, index * 16 + 16);
  return transformPoint(skin, p);
}

function dominantRegionBone(canonical: CanonicalHuman, region: RegionName): string | null {
  const totals = new Map<string, number>();
  for (const v of canonical.vertices) {
    if (v.region !== region) continue;
    for (const [bone, weight] of Object.entries(v.weights)) {
      totals.set(bone, (totals.get(bone) ?? 0) + weight);
    }
  }
  let best: string | null = null;
  let bestWeight = -Infinity;
  for (const [bone, weight] of totals) {
    if (weight > bestWeight) {
      best = bone;
      bestWeight = weight;
    }
  }
  return best;
}

function transformPoint(m: Float32Array, p: Vec3): Vec3 {
  return vec3(
    m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  );
}
