import { PropertyRegistry } from '../../core/schema/registry.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import type { Quat } from '../../core/math/vec.js';
import type { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../../animation/skeleton/skeletal-animation.js';

function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}
/** Deflection angle (degrees) of a quaternion relative to a reference about an axis. */
function decoupleAngle(q: Quat, rest: Quat, axis: 'x' | 'y' | 'z'): number {
  const rel = quatMul(q, quatConjugate(rest));
  const w = Math.max(-1, Math.min(1, rel.w));
  const half = Math.acos(w);
  let sign = 1;
  if (axis === 'x') sign = rel.x >= 0 ? 1 : -1;
  else if (axis === 'y') sign = rel.y >= 0 ? 1 : -1;
  else sign = rel.z >= 0 ? 1 : -1;
  return (2 * half * sign * 180) / Math.PI;
}

/** A bone-driven weight source: a coefficient from a bone's world rotation angle. */
export interface MorphBoneWeight {
  kind: 'bone';
  boneName: string;
  /** Local axis of the bone about which the angle is measured ('x'|'y'|'z'). */
  axis: 'x' | 'y' | 'z';
  /** Rest angle (degrees) that counts as neutral (0 coefficient). */
  neutralDeg: number;
  /** Full-span angle (degrees) that maps to +/-1 (signed by deviation direction). */
  spanDeg: number;
}

/**
 * A corrective morph is driven by the continuous product of several shaped
 * coefficients rather than a single property. This is how combination correctives
 * (e.g. wide jaw + wide mouth) and pose/skeleton correctives (e.g. jaw open under
 * head tilt) flow through the existing sparse morph pipeline.
 */
export interface MorphCorrectiveWeight {
  kind: 'corrective';
  /**
   * One entry per contributing factor (a property value or a bone deflection);
   * the activation is their product. Bone factors let pose feed the morph
   * pipeline (P15 pose correctives).
   */
  inputs: Array<
    | { property: string; influence?: (c: number) => number }
    | Omit<MorphBoneWeight, 'kind'>
  >;
}

export type MorphWeightSource = string | MorphCorrectiveWeight | MorphBoneWeight;

/** Identity-shaped coefficient from a property value (mirrors ShapeCoefficientSolver). */
function coefficientFor(value: number, min: number, max: number, def: number): number {
  if (def !== 0) return value / def - 1;
  const span = max - min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - min) / span));
}

/**
 * Maps semantic property values into morph weights that drive the GPU/CPU
 * morph pipeline.
 *
 * One property (e.g. face.eyeSpacing) may drive several morphs spread across
 * multiple parts/regions (body eye boxes, sclera, iris), so a property maps to
 * a list of morph names all sharing the same weight. Corrective morphs are
 * weighted by the continuous product of multiple shaped coefficients.
 *
 * Weight model (matches ShapeCoefficientSolver for consistency):
 *   - default != 0 : (value / default) - 1  (a ratio about neutral)
 *   - default == 0 : value scaled into the property's (min,max) as 0..1
 */
export class MorphDriver {
  /** morphName -> weight source (a property path, a corrective combination, or a bone). */
  private morphToProperty = new Map<string, MorphWeightSource>();
  private properties = new Set<string>();
  /** Current skeleton + pose, used to evaluate bone-driven sources. */
  private bones: BoneDef[] = [];
  private poses = new Map<string, BonePose>();

  constructor(private registry: PropertyRegistry) {
    this.register('face.nose.width', 'noseWidth');
    this.register('face.jaw.width', 'jawWidth');
    this.register('face.eyeSpacing', 'eyeSpacing', 'eyeSpacingSclera', 'eyeSpacingIris');
    this.register('face.mouth.width', 'mouthWidth');
    this.register('expression.jawOpen', 'jawOpen', 'jawOpenCavity');
  }

  private register(propPath: string, ...morphNames: string[]): void {
    void this.registry.require(propPath);
    this.properties.add(propPath);
    for (const n of morphNames) this.morphToProperty.set(n, propPath);
  }

  /**
   * Public registration of a single-property (linear) morph — used to wire shape
   * bases compiled into sparse morphs back to their driving property.
   */
  registerBasis(name: string, propPath: string): void {
    this.register(propPath, name);
  }

  /**
   * Register a bone-driven (pose) morph: its weight is the deflection coefficient
   * of the named bone about `axis` relative to rest. Pose is supplied via setPose().
   */
  registerBone(name: string, boneName: string, axis: 'x' | 'y' | 'z', neutralDeg: number, spanDeg: number): void {
    this.morphToProperty.set(name, { kind: 'bone', boneName, axis, neutralDeg, spanDeg });
  }

  /**
   * Register a corrective morph driven by the continuous product of several
   * shaped coefficients (properties and/or bone deflections). The corrective is
   * exposed as a normal sparse morph so the existing GPU morph pipeline consumes
   * it (weight == product of inputs).
   */
  registerCorrective(
    morphName: string,
    inputs: MorphCorrectiveWeight['inputs'],
  ): void {
    for (const input of inputs) {
      if ((input as { property?: string }).property) {
        void this.registry.require((input as { property: string }).property);
        this.properties.add((input as { property: string }).property);
      }
    }
    this.morphToProperty.set(morphName, { kind: 'corrective', inputs });
  }

  /**
   * Set the current skeleton + pose used to evaluate bone-driven weight sources.
   * Called by Human whenever a pose is applied so pose changes flow into the morph
   * pipeline (P15 pose correctives).
   */
  setPose(bones: BoneDef[], poses: BonePose[] = []): void {
    this.bones = bones;
    this.poses = new Map(poses.map((p) => [p.name, p]));
  }

  /** Morph names driven by a property path (linear, single-property morphs). */
  morphsForProperty(propPath: string): string[] {
    const meta = this.registry.require(propPath);
    const id = meta.id;
    const out: string[] = [];
    for (const [m, p] of this.morphToProperty) {
      if (typeof p === 'string' && p === propPath && this.registry.require(p).id === id)
        out.push(m);
    }
    return out;
  }

  /** True if a morph's weight source references the given property path. */
  morphUsesProperty(morphName: string, propPath: string): boolean {
    const source = this.morphToProperty.get(morphName);
    if (typeof source === 'string') return source === propPath;
    if (source && source.kind === 'corrective') {
      return source.inputs.some((i) => (i as { property?: string }).property === propPath);
    }
    return false;
  }

  /** True if a morph is driven by the named bone (pose corrective). */
  morphUsesBone(morphName: string, boneName: string): boolean {
    const source = this.morphToProperty.get(morphName);
    if (typeof source !== 'string' && source && source.kind === 'bone')
      return source.boneName === boneName;
    if (typeof source !== 'string' && source && source.kind === 'corrective') {
      return source.inputs.some((i) => (i as { boneName?: string }).boneName === boneName);
    }
    return false;
  }

  /** Bone deflection coefficient for a single-input bone source. */
  private boneCoefficient(
    input: Omit<MorphBoneWeight, 'kind'>,
    definition: HumanDefinition,
  ): number {
    void definition;
    const bone = this.bones.find((b) => b.name === input.boneName);
    if (!bone) return 0;
    const pose = this.poses.get(input.boneName);
    const qRest = bone.restRotation;
    const qPose = pose ? pose.localRot : qRest;
    const angle = decoupleAngle(qPose, qRest, input.axis) - input.neutralDeg;
    const span = input.spanDeg <= 0 ? 1 : input.spanDeg;
    return Math.max(-1, Math.min(1, angle / span));
  }

  /** Weight of a morph based on the current definition. 0 = neutral. */
  weight(definition: HumanDefinition, morphName: string): number {
    const source = this.morphToProperty.get(morphName);
    if (!source) return 0;
    if (typeof source === 'string') {
      const meta = this.registry.require(source);
      return coefficientFor(
        definition.get(source),
        typeof meta.min === 'number' ? meta.min : 0,
        typeof meta.max === 'number' ? meta.max : 1,
        meta.default,
      );
    }
    if (source.kind === 'bone') return this.boneCoefficient(source, definition);
    if (source.kind === 'corrective') {
      let acc = 1;
      for (const input of source.inputs) {
        let c = 0;
        if ((input as { boneName?: string }).boneName) {
          c = this.boneCoefficient(input as Omit<MorphBoneWeight, 'kind'>, definition);
        } else {
          const p = input as { property: string; influence?: (c: number) => number };
          const meta = this.registry.require(p.property);
          c = coefficientFor(
            definition.get(p.property),
            typeof meta.min === 'number' ? meta.min : 0,
            typeof meta.max === 'number' ? meta.max : 1,
            meta.default,
          );
          if (p.influence) c = p.influence(c);
        }
        acc *= c;
        if (acc === 0) break;
      }
      return acc;
    }
    return 0;
  }
}
