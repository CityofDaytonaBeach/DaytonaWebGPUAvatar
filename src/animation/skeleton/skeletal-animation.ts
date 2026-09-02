import { Quat, Vec3, IDENTITY_QUAT } from '../../core/math/vec.js';

export interface BonePose {
  name: string;
  localPos: Vec3;
  localRot: Quat;
}

export type AnimationChannel = { bone: string; times: number[]; rotations: Quat[] };

/**
 * Skeletal animation system. Holds animation clips, blends them, and produces
 * an ordered list of bone poses for a given time. Layering is supported via a
 * list of active clips with blend weights.
 */
export class SkeletalAnimation {
  private clips = new Map<string, AnimationChannel[]>();
  private clipWeights = new Map<string, number>();

  addClip(name: string, channels: AnimationChannel[]): void {
    this.clips.set(name, channels);
    this.clipWeights.set(name, 0);
  }

  setWeight(name: string, weight: number): void {
    this.clipWeights.set(name, weight);
  }

  /**
   * Compute bone poses at time `t`. Sums weighted rotations across active
   * clips (simple nlerp-style accumulation, v0.1).
   */
  sample(boneNames: string[], t: number): BonePose[] {
    const poses: BonePose[] = [];
    for (const bone of boneNames) {
      const out: BonePose = { name: bone, localPos: { x: 0, y: 0, z: 0 }, localRot: IDENTITY_QUAT };
      for (const [clipName, channels] of this.clips) {
        const weight = this.clipWeights.get(clipName) ?? 0;
        if (weight === 0) continue;
        const channel = channels.find((c) => c.bone === bone);
        if (!channel || channel.times.length === 0) continue;
        const rot = sampleChannel(channel, t);
        out.localRot = nlerp(out.localRot, rot, weight);
      }
      poses.push(out);
    }
    return poses;
  }
}

export function sampleChannel(channel: AnimationChannel, t: number): Quat {
  const t0 = channel.times[0];
  const t1 = channel.times[channel.times.length - 1];
  if (t <= t0) return channel.rotations[0];
  if (t >= t1) return channel.rotations[channel.rotations.length - 1];
  for (let i = 0; i < channel.times.length - 1; i++) {
    const a = channel.times[i];
    const b = channel.times[i + 1];
    if (t >= a && t <= b) {
      const f = (t - a) / (b - a);
      return nlerp(channel.rotations[i], channel.rotations[i + 1], f);
    }
  }
  return IDENTITY_QUAT;
}

export function nlerp(a: Quat, b: Quat, t: number): Quat {
  // Flip sign to take shortest path.
  let dx = b.x,
    dy = b.y,
    dz = b.z,
    dw = b.w;
  if (a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0) {
    dx = -dx;
    dy = -dy;
    dz = -dz;
    dw = -dw;
  }
  const k = 1 - t;
  return normalizeQuat({
    x: a.x * k + dx * t,
    y: a.y * k + dy * t,
    z: a.z * k + dz * t,
    w: a.w * k + dw * t,
  });
}

export function normalizeQuat(q: Quat): Quat {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len === 0) return IDENTITY_QUAT;
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

export function quatFromEulerDeg(xDeg: number, yDeg: number, zDeg: number): Quat {
  const x = (xDeg * Math.PI) / 180;
  const y = (yDeg * Math.PI) / 180;
  const z = (zDeg * Math.PI) / 180;
  const cx = Math.cos(x / 2),
    sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2),
    sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2),
    sz = Math.sin(z / 2);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}
