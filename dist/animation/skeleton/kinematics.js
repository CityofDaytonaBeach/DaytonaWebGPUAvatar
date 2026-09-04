import { IDENTITY_QUAT } from '../../core/math/vec.js';
import { normalizeQuat } from './skeletal-animation.js';
// ─── Quaternion / vector toolkit (exported: IK + retargeting consume it) ─────
export function quatMul(a, b) {
    return {
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
}
export function quatConjugate(q) {
    return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}
export function quatFromAxisAngle(axis, angleRad) {
    const len = Math.hypot(axis.x, axis.y, axis.z);
    if (len === 0 || !Number.isFinite(angleRad))
        return IDENTITY_QUAT;
    const h = angleRad / 2;
    const s = Math.sin(h) / len;
    return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(h) };
}
export function rotateVec3(q, v) {
    // v' = v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
    const tx = q.y * v.z - q.z * v.y + q.w * v.x;
    const ty = q.z * v.x - q.x * v.z + q.w * v.y;
    const tz = q.x * v.y - q.y * v.x + q.w * v.z;
    return {
        x: v.x + 2 * (q.y * tz - q.z * ty),
        y: v.y + 2 * (q.z * tx - q.x * tz),
        z: v.z + 2 * (q.x * ty - q.y * tx),
    };
}
/** Shortest-arc rotation taking unit vector `from` onto unit vector `to`. */
export function quatBetween(from, to) {
    const a = normalizeVec3(from);
    const b = normalizeVec3(to);
    const d = a.x * b.x + a.y * b.y + a.z * b.z;
    if (d >= 1 - 1e-9)
        return IDENTITY_QUAT;
    if (d <= -1 + 1e-9) {
        // Opposite vectors: rotate 180° about any perpendicular axis (deterministic pick).
        const axis = Math.abs(a.x) < 0.9 ? crossVec3(a, { x: 1, y: 0, z: 0 }) : crossVec3(a, { x: 0, y: 1, z: 0 });
        return quatFromAxisAngle(axis, Math.PI);
    }
    const axis = crossVec3(a, b);
    return normalizeQuat({ x: axis.x, y: axis.y, z: axis.z, w: 1 + d });
}
export function normalizeVec3(v) {
    const len = Math.hypot(v.x, v.y, v.z);
    if (len === 0)
        return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}
export function addVec3(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function subVec3(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function scaleVec3(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}
export function crossVec3(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}
export function dotVec3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function distanceVec3(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
/** Quaternion → intrinsic XYZ euler angles in degrees (matches quatFromEulerDeg). */
export function quatToEulerDeg(q) {
    const n = normalizeQuat(q);
    const sinp = 2 * (n.w * n.x + n.y * n.z);
    const cosp = 1 - 2 * (n.x * n.x + n.y * n.y);
    const x = Math.atan2(sinp, cosp);
    const siny = 2 * (n.w * n.y - n.z * n.x);
    const y = Math.asin(Math.max(-1, Math.min(1, siny)));
    const sinr = 2 * (n.w * n.z + n.x * n.y);
    const cosr = 1 - 2 * (n.y * n.y + n.z * n.z);
    const z = Math.atan2(sinr, cosr);
    const k = 180 / Math.PI;
    return { x: x * k, y: y * k, z: z * k };
}
// ─── Forward kinematics ─────────────────────────────────────────────────────
/** Order the skeleton parents-first so a single pass can evaluate FK. */
export function topologicalBoneOrder(skeleton) {
    const byName = new Map(skeleton.map((b) => [b.name, b]));
    const out = [];
    const done = new Set();
    const visit = (bone, guard) => {
        if (done.has(bone.name) || guard > skeleton.length)
            return;
        if (bone.parent) {
            const parent = byName.get(bone.parent);
            if (parent && !done.has(parent.name))
                visit(parent, guard + 1);
        }
        if (done.has(bone.name))
            return;
        done.add(bone.name);
        out.push(bone);
    };
    for (const bone of skeleton)
        visit(bone, 0);
    return out;
}
export function poseMap(poses) {
    const map = new Map();
    for (const p of poses)
        map.set(p.name, p);
    return map;
}
/**
 * Evaluate world-space transforms for every bone under `poses`.
 * Bones without a pose fall back to their rest transform.
 */
export function forwardKinematics(skeleton, poses = []) {
    const map = poses instanceof Map ? poses : poseMap(poses);
    const out = new Map();
    for (const bone of topologicalBoneOrder(skeleton)) {
        const parent = bone.parent ? out.get(bone.parent) : undefined;
        const parentPos = parent?.worldPos ?? { x: 0, y: 0, z: 0 };
        const parentRot = parent?.worldRot ?? IDENTITY_QUAT;
        const pose = map.get(bone.name);
        const local = pose?.localRot ?? IDENTITY_QUAT;
        const offset = pose?.localPos ?? bone.localPosition;
        const worldRot = normalizeQuat(quatMul(quatMul(parentRot, bone.restRotation), local));
        const worldPos = addVec3(parentPos, rotateVec3(parentRot, offset));
        out.set(bone.name, { name: bone.name, worldPos, worldRot });
    }
    return out;
}
/** World-space position of a single bone joint under `poses`. */
export function boneWorldPosition(skeleton, bone, poses = []) {
    return forwardKinematics(skeleton, poses).get(bone)?.worldPos ?? null;
}
/** Resolve `root -> ... -> leaf` as an ordered bone chain, or null if unrelated. */
export function resolveBoneChain(skeleton, root, leaf) {
    const byName = new Map(skeleton.map((b) => [b.name, b]));
    const chain = [];
    let cursor = leaf;
    let guard = 0;
    while (cursor && guard <= skeleton.length) {
        chain.push(cursor);
        if (cursor === root) {
            return chain.reverse();
        }
        cursor = byName.get(cursor)?.parent ?? null;
        guard += 1;
    }
    return null;
}
// ─── Joint limits ───────────────────────────────────────────────────────────
/** Clamp a local rotation into the bone's authored euler limits (no-op when absent). */
export function clampPoseToLimits(bone, rot) {
    if (!bone.limits)
        return rot;
    const e = quatToEulerDeg(rot);
    const { minDeg, maxDeg } = bone.limits;
    const cx = Math.max(minDeg.x, Math.min(maxDeg.x, e.x));
    const cy = Math.max(minDeg.y, Math.min(maxDeg.y, e.y));
    const cz = Math.max(minDeg.z, Math.min(maxDeg.z, e.z));
    if (cx === e.x && cy === e.y && cz === e.z)
        return rot;
    return eulerDegToQuat(cx, cy, cz);
}
/** Inverse of `quatToEulerDeg` (kept local so kinematics has no import cycle). */
export function eulerDegToQuat(xDeg, yDeg, zDeg) {
    const x = (xDeg * Math.PI) / 180;
    const y = (yDeg * Math.PI) / 180;
    const z = (zDeg * Math.PI) / 180;
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    return normalizeQuat({
        x: sx * cy * cz - cx * sy * sz,
        y: cx * sy * cz + sx * cy * sz,
        z: cx * cy * sz - sx * sy * cz,
        w: cx * cy * cz + sx * sy * sz,
    });
}
//# sourceMappingURL=kinematics.js.map