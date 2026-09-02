import { Quat, Vec3, multiplyMatrices } from '../../core/math/vec';
import { BoneDef } from './skeleton';
import { BonePose } from '../../animation/skeleton/skeletal-animation';

/**
 * Forward-kinematics + skin-matrix construction for the parametric skeleton.
 *
 * `buildBoneMatrices` walks the rest skeleton and every pose into a per-bone
 * *current* world matrix (translation then rotation, chained by parent). The
 * classic skinned-animation formulation then combines inverse-bind with the
 * current matrix per bone: `skinMatrix = invBindWorld * currentWorld`, so at the
 * rest pose every skin matrix is the identity (vertices stay put) and rotating a
 * bone transforms exactly the vertices bound to it.
 */
export function buildBoneMatrices(
  bones: BoneDef[],
  poses: BonePose[] = [],
): { current: Float32Array; bind: Float32Array; inverseBind: Float32Array } {
  const poseByName = new Map<string, BonePose>();
  for (const p of poses) poseByName.set(p.name, p);
  const indexByName = new Map<string, number>();
  const defByName = new Map<string, BoneDef>();
  bones.forEach((b, i) => {
    indexByName.set(b.name, i);
    defByName.set(b.name, b);
  });

  const count = bones.length;
  const current = new Float32Array(count * 16);
  const bind = new Float32Array(count * 16);
  const inverseBind = new Float32Array(count * 16);

  for (const bone of bones) {
    const i = indexByName.get(bone.name)!;
    let pos = bone.localPosition;
    let rot = bone.restRotation;
    if (poseByName.has(bone.name)) {
      const p = poseByName.get(bone.name)!;
      pos = p.localPos;
      rot = p.localRot;
    }
    const local = composeMatrix(pos, rot);
    const parentI = bone.parent ? (indexByName.get(bone.parent) ?? null) : null;
    const world = parentI != null ? multiplyMatrices(read(current, parentI), local) : local;
    write(current, i, world);

    // Bind layer (rest pose).
    const bindLocal = composeMatrix(bone.localPosition, bone.restRotation);
    const bindWorld =
      parentI != null ? multiplyMatrices(read(bind, parentI), bindLocal) : bindLocal;
    write(bind, i, bindWorld);
    write(inverseBind, i, invertMatrix(bindWorld));
  }

  return { current, bind, inverseBind };
}

/**
 * Combined per-bone skinning matrices (mat4 per bone = count*16 floats), in
 * skeleton order so index `i` matches `CanonicalHuman.boneId(name)` ordering.
 * At the rest pose every matrix is the identity.
 */
export function combinedSkinMatrices(bones: BoneDef[], poses: BonePose[] = []): Float32Array {
  const { inverseBind, current } = buildBoneMatrices(bones, poses);
  const n = bones.length;
  const out = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) {
    write(out, i, multiplyMatrices(read(inverseBind, i), read(current, i)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matrix primitives
// ---------------------------------------------------------------------------

export function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function composeMatrix(t: Vec3, q: Quat): Float32Array {
  const m = identityMatrix();
  m[12] = t.x;
  m[13] = t.y;
  m[14] = t.z;
  const { x, y, z, w } = q;
  const xx = x * x,
    yy = y * y,
    zz = z * z;
  const xy = x * y,
    xz = x * z,
    yz = y * z;
  const wx = w * x,
    wy = w * y,
    wz = w * z;
  m[0] = 1 - 2 * (yy + zz);
  m[1] = 2 * (xy + wz);
  m[2] = 2 * (xz - wy);
  m[4] = 2 * (xy - wz);
  m[5] = 1 - 2 * (xx + zz);
  m[6] = 2 * (yz + wx);
  m[8] = 2 * (xz + wy);
  m[9] = 2 * (yz - wx);
  m[10] = 1 - 2 * (xx + yy);
  return m;
}

/** Invert an affine transform (rotation+scale upper 3x3, translation col). */
export function invertMatrix(m: Float32Array): Float32Array {
  const out = new Float32Array(16);
  const a00 = m[0],
    a01 = m[1],
    a02 = m[2];
  const a10 = m[4],
    a11 = m[5],
    a12 = m[6];
  const a20 = m[8],
    a21 = m[9],
    a22 = m[10];
  const tx = m[12],
    ty = m[13],
    tz = m[14];
  out[0] = a00;
  out[1] = a10;
  out[2] = a20;
  out[4] = a01;
  out[5] = a11;
  out[6] = a21;
  out[8] = a02;
  out[9] = a12;
  out[10] = a22;
  out[3] = 0;
  out[7] = 0;
  out[11] = 0;
  out[15] = 1;
  out[12] = -(a00 * tx + a01 * ty + a02 * tz);
  out[13] = -(a10 * tx + a11 * ty + a12 * tz);
  out[14] = -(a20 * tx + a21 * ty + a22 * tz);
  return out;
}

function read(buf: Float32Array, i: number): Float32Array {
  return buf.subarray(i * 16, i * 16 + 16);
}

function write(buf: Float32Array, i: number, m: Float32Array): void {
  buf.set(m, i * 16);
}
