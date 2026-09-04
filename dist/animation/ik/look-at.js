import { IDENTITY_QUAT } from '../../core/math/vec.js';
import { addVec3, clampPoseToLimits, dotVec3, forwardKinematics, normalizeVec3, poseMap, quatBetween, quatConjugate, quatMul, rotateVec3, subVec3, } from '../skeleton/kinematics.js';
import { mergePoses } from './ik-solver.js';
const DEFAULT_CHAIN = ['neck', 'head'];
const DEFAULT_WEIGHTS = [0.6, 0.4];
export function solveLookAtChain(skeleton, options) {
    const byName = new Map(skeleton.map((b) => [b.name, b]));
    const chain = (options.chain ?? DEFAULT_CHAIN).filter((n) => byName.has(n));
    const base = (options.basePoses ?? []).map(clonePose);
    const forward = normalizeVec3(options.forwardAxis ?? { x: 0, y: 0, z: 1 });
    const intensity = clamp01(options.intensity ?? 1);
    const maxAngleDeg = Math.max(0, options.maxAngleDeg ?? 80);
    const passes = Math.max(1, Math.floor(options.passes ?? 2));
    const respectLimits = options.respectLimits ?? true;
    if (chain.length === 0 || intensity === 0) {
        const fk = forwardKinematics(skeleton, base);
        const gazeBone = chain[chain.length - 1];
        return {
            poses: [],
            mergedPoses: base,
            angleErrorDeg: measureGazeError(skeleton, base, gazeBone, forward, options.target),
            clamped: false,
            requestedAngleDeg: 0,
            chain,
            passes: 0,
            gazeOrigin: { ...(gazeBone ? (fk.get(gazeBone)?.worldPos ?? ZERO) : ZERO) },
        };
    }
    const weights = normalizeWeights(options.weights ?? defaultWeights(chain.length), chain.length);
    let working = base.slice();
    let clamped = false;
    let requestedAngleDeg = 0;
    const gazeBone = chain[chain.length - 1];
    for (let pass = 0; pass < passes; pass++) {
        const fk = forwardKinematics(skeleton, working);
        const gaze = fk.get(gazeBone);
        if (!gaze)
            break;
        const restForwardWorld = normalizeVec3(rotateVec3(baseForwardRotation(skeleton, base, gazeBone), forward));
        const toTarget = normalizeVec3(subVec3(options.target, gaze.worldPos));
        if (!isFinite3(toTarget))
            break;
        const deviationDeg = angleDeg(restForwardWorld, toTarget);
        if (pass === 0)
            requestedAngleDeg = deviationDeg;
        let aim = toTarget;
        if (deviationDeg > maxAngleDeg) {
            clamped = true;
            aim = slerpDirection(restForwardWorld, toTarget, maxAngleDeg / deviationDeg);
        }
        const currentForwardWorld = normalizeVec3(rotateVec3(gaze.worldRot, forward));
        const correction = quatBetween(currentForwardWorld, aim);
        // Distribute the correction along the chain in each bone's parent space.
        const poses = [];
        const baseMap = poseMap(working);
        for (let i = 0; i < chain.length; i++) {
            const bone = byName.get(chain[i]);
            const share = weights[i] * intensity;
            const partial = scaleRotation(correction, share);
            const parentRot = bone.parent
                ? (fk.get(bone.parent)?.worldRot ?? IDENTITY_QUAT)
                : IDENTITY_QUAT;
            const qPre = quatMul(parentRot, bone.restRotation);
            const existing = baseMap.get(bone.name)?.localRot ?? IDENTITY_QUAT;
            // Express the world-space partial correction in this bone's local frame.
            const worldCurrent = quatMul(qPre, existing);
            const desiredWorld = quatMul(partial, worldCurrent);
            let local = quatMul(quatConjugate(qPre), desiredWorld);
            if (respectLimits) {
                const limited = clampPoseToLimits(bone, local);
                if (limited !== local)
                    clamped = true;
                local = limited;
            }
            poses.push({
                name: bone.name,
                localPos: { ...(baseMap.get(bone.name)?.localPos ?? bone.localPosition) },
                localRot: local,
            });
        }
        working = mergePoses(working, poses);
    }
    const fkFinal = forwardKinematics(skeleton, working);
    const solved = chain
        .map((name) => working.find((p) => p.name === name))
        .filter((p) => Boolean(p));
    return {
        poses: solved.map(clonePose),
        mergedPoses: working,
        angleErrorDeg: measureGazeError(skeleton, working, gazeBone, forward, options.target),
        clamped,
        requestedAngleDeg,
        chain,
        passes,
        gazeOrigin: { ...(fkFinal.get(gazeBone)?.worldPos ?? ZERO) },
    };
}
/** FK-measured angle between a bone's forward axis and the direction to `target`. */
export function measureGazeError(skeleton, poses, bone, forwardAxis, target) {
    if (!bone)
        return Number.POSITIVE_INFINITY;
    const fk = forwardKinematics(skeleton, poses);
    const t = fk.get(bone);
    if (!t)
        return Number.POSITIVE_INFINITY;
    const forward = normalizeVec3(rotateVec3(t.worldRot, normalizeVec3(forwardAxis)));
    const toTarget = normalizeVec3(subVec3(target, t.worldPos));
    if (!isFinite3(forward) || !isFinite3(toTarget))
        return Number.POSITIVE_INFINITY;
    return angleDeg(forward, toTarget);
}
// ─── helpers ────────────────────────────────────────────────────────────────
const ZERO = { x: 0, y: 0, z: 0 };
function baseForwardRotation(skeleton, base, bone) {
    if (!bone)
        return IDENTITY_QUAT;
    // Rest orientation of the gaze bone with the chain's own rotations removed.
    const fk = forwardKinematics(skeleton, base.filter((p) => p.name !== bone));
    return fk.get(bone)?.worldRot ?? IDENTITY_QUAT;
}
function defaultWeights(length) {
    if (length === 2)
        return [...DEFAULT_WEIGHTS];
    return new Array(length).fill(1 / length);
}
function normalizeWeights(weights, length) {
    const padded = new Array(length)
        .fill(0)
        .map((_, i) => (Number.isFinite(weights[i]) && weights[i] > 0 ? weights[i] : 0));
    const sum = padded.reduce((a, b) => a + b, 0);
    if (sum <= 0)
        return new Array(length).fill(1 / length);
    return padded.map((w) => w / sum);
}
/** Scale a rotation by `t` along its own axis (0 = identity, 1 = full). */
function scaleRotation(q, t) {
    const w = Math.max(-1, Math.min(1, q.w));
    const angle = 2 * Math.acos(w);
    const s = Math.sqrt(Math.max(0, 1 - w * w));
    if (s <= 1e-9 || !Number.isFinite(angle))
        return IDENTITY_QUAT;
    const axis = { x: q.x / s, y: q.y / s, z: q.z / s };
    const half = (angle * t) / 2;
    const sh = Math.sin(half);
    return { x: axis.x * sh, y: axis.y * sh, z: axis.z * sh, w: Math.cos(half) };
}
function slerpDirection(from, to, t) {
    const q = scaleRotation(quatBetween(from, to), clamp01(t));
    return normalizeVec3(rotateVec3(q, from));
}
function angleDeg(a, b) {
    const cos = Math.max(-1, Math.min(1, dotVec3(a, b)));
    return (Math.acos(cos) * 180) / Math.PI;
}
function isFinite3(v) {
    return (Number.isFinite(v.x) &&
        Number.isFinite(v.y) &&
        Number.isFinite(v.z) &&
        Math.hypot(v.x, v.y, v.z) > 1e-9);
}
function clamp01(v) {
    return !Number.isFinite(v) ? 0 : v <= 0 ? 0 : v >= 1 ? 1 : v;
}
function clonePose(p) {
    return { name: p.name, localPos: { ...p.localPos }, localRot: { ...p.localRot } };
}
// Re-exported so consumers can build world-space gaze targets from bone space.
export function worldPointFromBone(skeleton, poses, bone, localOffset) {
    const t = forwardKinematics(skeleton, poses).get(bone);
    if (!t)
        return null;
    return addVec3(t.worldPos, rotateVec3(t.worldRot, localOffset));
}
//# sourceMappingURL=look-at.js.map