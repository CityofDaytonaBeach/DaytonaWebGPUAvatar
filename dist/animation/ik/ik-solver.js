import { IDENTITY_QUAT } from '../../core/math/vec.js';
import { addVec3, clampPoseToLimits, crossVec3, distanceVec3, dotVec3, forwardKinematics, normalizeVec3, poseMap, quatBetween, quatConjugate, quatFromAxisAngle, quatMul, resolveBoneChain, rotateVec3, scaleVec3, subVec3, } from '../skeleton/kinematics.js';
const DEFAULTS = {
    iterations: 12,
    passes: 3,
    tolerance: 0.01,
    respectLimits: true,
};
/**
 * Solve a chain from `root` to `effector` so the effector joint reaches `target`.
 * Returns an FK-measured result; never throws on a bad chain (reports instead).
 */
export function solveChainIK(skeleton, root, effector, options) {
    const chain = resolveBoneChain(skeleton, root, effector);
    const base = (options.basePoses ?? []).map(clonePose);
    const empty = (reason) => ({
        poses: [],
        mergedPoses: base,
        error: Number.POSITIVE_INFINITY,
        reached: false,
        targetUnreachable: reason === 'chain',
        reach: 0,
        iterations: 0,
        chain: chain ?? [],
        effectorPosition: { x: 0, y: 0, z: 0 },
    });
    if (!chain || chain.length < 2)
        return empty('chain');
    const byName = new Map(skeleton.map((b) => [b.name, b]));
    const iterations = Math.max(1, Math.floor(options.iterations ?? DEFAULTS.iterations));
    const passes = Math.max(1, Math.floor(options.passes ?? DEFAULTS.passes));
    const tolerance = Math.max(1e-6, options.tolerance ?? DEFAULTS.tolerance);
    const respectLimits = options.respectLimits ?? DEFAULTS.respectLimits;
    // Rest/base FK gives the starting joint positions and the fixed segment lengths.
    let working = base.slice();
    let fk = forwardKinematics(skeleton, working);
    const startPositions = chain.map((name) => ({
        ...(fk.get(name)?.worldPos ?? { x: 0, y: 0, z: 0 }),
    }));
    const lengths = [];
    for (let i = 0; i < startPositions.length - 1; i++) {
        lengths.push(distanceVec3(startPositions[i], startPositions[i + 1]));
    }
    const reach = lengths.reduce((a, b) => a + b, 0);
    if (reach <= 1e-6)
        return empty('degenerate');
    const rootPos = startPositions[0];
    const targetDistance = distanceVec3(rootPos, options.target);
    const targetUnreachable = targetDistance > reach + 1e-9;
    let totalIterations = 0;
    let solvedPoses = [];
    let error = Number.POSITIVE_INFINITY;
    let effectorPosition = startPositions[startPositions.length - 1];
    for (let pass = 0; pass < passes; pass++) {
        const positions = chain.map((name) => ({
            ...(fk.get(name)?.worldPos ?? { x: 0, y: 0, z: 0 }),
        }));
        positions[0] = { ...rootPos };
        totalIterations += fabrik(positions, lengths, options.target, iterations, tolerance);
        if (options.poleVector)
            applyPoleVector(positions, options.poleVector, lengths);
        solvedPoses = positionsToLocalPoses(skeleton, byName, chain, positions, working, respectLimits);
        working = mergePoses(base, solvedPoses);
        fk = forwardKinematics(skeleton, working);
        effectorPosition = { ...(fk.get(chain[chain.length - 1])?.worldPos ?? effectorPosition) };
        error = distanceVec3(effectorPosition, options.target);
        if (error <= tolerance)
            break;
    }
    return {
        poses: solvedPoses,
        mergedPoses: working,
        error,
        reached: error <= tolerance,
        targetUnreachable,
        reach,
        iterations: totalIterations,
        chain,
        effectorPosition,
    };
}
/**
 * Convenience wrapper: solve an arm (`upperarm_* -> hand_*`) or leg
 * (`thigh_* -> foot_*`) chain with a sensible default pole vector.
 */
export function solveLimbIK(skeleton, limb, target, options = {}) {
    const spec = {
        arm_l: { root: 'upperarm_l', effector: 'hand_l', pole: { x: -0.4, y: -0.2, z: -1 } },
        arm_r: { root: 'upperarm_r', effector: 'hand_r', pole: { x: 0.4, y: -0.2, z: -1 } },
        leg_l: { root: 'thigh_l', effector: 'foot_l', pole: { x: -0.1, y: 0, z: 1 } },
        leg_r: { root: 'thigh_r', effector: 'foot_r', pole: { x: 0.1, y: 0, z: 1 } },
    };
    const { root, effector, pole } = spec[limb];
    return solveChainIK(skeleton, root, effector, {
        poleVector: pole,
        ...options,
        target,
    });
}
// ─── FABRIK core ────────────────────────────────────────────────────────────
/** In-place FABRIK. Returns the number of iterations actually run. */
export function fabrik(positions, lengths, target, iterations, tolerance) {
    const n = positions.length;
    if (n < 2)
        return 0;
    const origin = { ...positions[0] };
    const reach = lengths.reduce((a, b) => a + b, 0);
    // Out of reach: stretch straight at the target and stop (the classic FABRIK case).
    if (distanceVec3(origin, target) > reach) {
        const dir = normalizeVec3(subVec3(target, origin));
        let cursor = origin;
        positions[0] = { ...origin };
        for (let i = 0; i < lengths.length; i++) {
            cursor = addVec3(cursor, scaleVec3(dir, lengths[i]));
            positions[i + 1] = { ...cursor };
        }
        return 1;
    }
    let run = 0;
    for (let it = 0; it < iterations; it++) {
        run += 1;
        // Backward: pull the effector onto the target, walking toward the root.
        positions[n - 1] = { ...target };
        for (let i = n - 2; i >= 0; i--) {
            positions[i] = movedToward(positions[i + 1], positions[i], lengths[i]);
        }
        // Forward: pin the root back, walking out to the effector.
        positions[0] = { ...origin };
        for (let i = 1; i < n; i++) {
            positions[i] = movedToward(positions[i - 1], positions[i], lengths[i - 1]);
        }
        if (distanceVec3(positions[n - 1], target) <= tolerance)
            break;
    }
    return run;
}
function movedToward(anchor, point, length) {
    const delta = subVec3(point, anchor);
    const dist = Math.hypot(delta.x, delta.y, delta.z);
    if (dist <= 1e-9)
        return addVec3(anchor, { x: 0, y: length, z: 0 });
    return addVec3(anchor, scaleVec3(delta, length / dist));
}
/**
 * Rotate interior joints about the root→effector axis so the bend points at the
 * pole vector. Segment lengths are preserved because the rotation is rigid about
 * an axis through the joint's own projection onto the root→effector line.
 */
export function applyPoleVector(positions, poleVector, lengths) {
    const n = positions.length;
    if (n < 3)
        return;
    const root = positions[0];
    const end = positions[n - 1];
    const axis = subVec3(end, root);
    const axisLen = Math.hypot(axis.x, axis.y, axis.z);
    if (axisLen <= 1e-6)
        return;
    const axisDir = scaleVec3(axis, 1 / axisLen);
    // Desired bend direction, made perpendicular to the chain axis.
    const poleRaw = normalizeVec3(poleVector);
    const desired = normalizeVec3(subVec3(poleRaw, scaleVec3(axisDir, dotVec3(poleRaw, axisDir))));
    if (Math.hypot(desired.x, desired.y, desired.z) <= 1e-6)
        return;
    // Use the first interior joint to measure the current bend plane, then rotate
    // every interior joint by the same angle so the chain stays rigid.
    const j = positions[1];
    const toJoint = subVec3(j, root);
    const current = normalizeVec3(subVec3(toJoint, scaleVec3(axisDir, dotVec3(toJoint, axisDir))));
    if (Math.hypot(current.x, current.y, current.z) <= 1e-6)
        return;
    const cos = Math.max(-1, Math.min(1, dotVec3(current, desired)));
    const sign = dotVec3(crossVec3(current, desired), axisDir) < 0 ? -1 : 1;
    const angle = sign * Math.acos(cos);
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-9)
        return;
    const rot = quatFromAxisAngle(axisDir, angle);
    for (let i = 1; i < n - 1; i++) {
        const rel = subVec3(positions[i], root);
        positions[i] = addVec3(root, rotateVec3(rot, rel));
    }
    void lengths; // lengths are preserved by construction (rigid rotation).
}
// ─── Position -> local rotation conversion ──────────────────────────────────
function positionsToLocalPoses(skeleton, byName, chain, positions, basePoses, respectLimits) {
    const baseMap = poseMap(basePoses);
    const fkBase = forwardKinematics(skeleton, basePoses);
    const out = [];
    // Parent world transform of the chain root is unaffected by the solve.
    const rootBone = byName.get(chain[0]);
    let parentRot = rootBone.parent
        ? (fkBase.get(rootBone.parent)?.worldRot ?? IDENTITY_QUAT)
        : IDENTITY_QUAT;
    let jointPos = { ...positions[0] };
    for (let i = 0; i < chain.length - 1; i++) {
        const bone = byName.get(chain[i]);
        const child = byName.get(chain[i + 1]);
        const offset = baseMap.get(child.name)?.localPos ?? child.localPosition;
        const restDir = normalizeVec3(offset);
        const desiredWorld = normalizeVec3(subVec3(positions[i + 1], jointPos));
        const qPre = quatMul(parentRot, bone.restRotation);
        const desiredLocal = rotateVec3(quatConjugate(qPre), desiredWorld);
        let local = quatBetween(restDir, desiredLocal);
        if (respectLimits)
            local = clampPoseToLimits(bone, local);
        const localPos = baseMap.get(bone.name)?.localPos ?? bone.localPosition;
        out.push({ name: bone.name, localPos: { ...localPos }, localRot: local });
        const worldRot = quatMul(qPre, local);
        jointPos = addVec3(jointPos, rotateVec3(worldRot, offset));
        parentRot = worldRot;
    }
    return out;
}
export function mergePoses(base, overrides) {
    const map = new Map();
    for (const p of base)
        map.set(p.name, clonePose(p));
    for (const p of overrides)
        map.set(p.name, clonePose(p));
    return [...map.values()];
}
function clonePose(p) {
    return { name: p.name, localPos: { ...p.localPos }, localRot: { ...p.localRot } };
}
//# sourceMappingURL=ik-solver.js.map