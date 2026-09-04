import { nlerp } from '../skeleton/skeletal-animation.js';
import { solveChainIK, solveLimbIK, } from '../ik/ik-solver.js';
import { solveLookAtChain } from '../ik/look-at.js';
import { MotionCompiler, validateMotion, } from './motion-compiler.js';
export const DEFAULT_MOTION_RUNTIME_CONFIG = {
    defaultBlendDuration: 0.3,
    minConfidence: 0.2,
    requireValidation: true,
    walkCycleSeconds: 1.1,
};
const CONTINUOUS_KINDS = new Set(['walk']);
export class MotionRuntime {
    skeleton;
    compiler;
    config;
    clock = 0;
    frames = 0;
    accepted = 0;
    rejections = [];
    /** Pose the runtime is fading away from (the last fully applied pose). */
    fromPoses = [];
    activePlan = null;
    activeCommand = null;
    blendElapsed = 0;
    blendDuration = 0;
    walkPhase = 0;
    /** IK constraints layered on top of the blended motion pose, in insertion order. */
    ikRequests = new Map();
    lastIkFrames = [];
    /** Persistent gaze constraint, layered last so it wins over motion. */
    lookAtRequest = null;
    lastLookAtFrame = null;
    constructor(skeleton, config = {}) {
        this.skeleton = skeleton;
        this.config = { ...DEFAULT_MOTION_RUNTIME_CONFIG, ...config };
        this.compiler = new MotionCompiler(this.config.compiler);
    }
    get time() {
        return this.clock;
    }
    /** Compile, validate, and install a command as the new target motion. */
    push(command) {
        const plan = this.compiler.compile(command, this.skeleton);
        const validation = this.config.requireValidation ? validateMotion(plan, this.skeleton) : null;
        const reason = plan.kind === 'unknown'
            ? (plan.reason ?? 'unrecognized command')
            : plan.confidence < this.config.minConfidence
                ? `confidence ${plan.confidence.toFixed(2)} below ${this.config.minConfidence}`
                : validation && !validation.valid
                    ? `validation failed: ${validation.violations.join('; ')}`
                    : null;
        if (reason !== null) {
            const rejection = {
                command,
                reason,
                kind: plan.kind,
                confidence: plan.confidence,
                validation,
            };
            this.rejections.push(rejection);
            return { accepted: false, plan, rejection };
        }
        // Start the cross-fade from whatever is on screen right now.
        this.fromPoses = this.currentPoses();
        this.activePlan = plan;
        this.activeCommand = command;
        this.blendDuration = Math.max(0, plan.blendDuration ?? this.config.defaultBlendDuration);
        this.blendElapsed = 0;
        if (plan.kind === 'walk')
            this.walkPhase = 0;
        this.accepted += 1;
        return { accepted: true, plan };
    }
    /** Return to rest, cross-fading out of the active motion. */
    release() {
        if (!this.activePlan)
            return;
        this.fromPoses = this.currentPoses();
        this.activePlan = { kind: 'neutral', confidence: 1, poses: [] };
        this.activeCommand = null;
        this.blendDuration = this.config.defaultBlendDuration;
        this.blendElapsed = 0;
    }
    // ─── IK / gaze constraints (layered on every frame, above the motion blend) ──
    /**
     * Install (or replace) an IK constraint. Constraints are persistent: every
     * subsequent `tick` re-solves them against that frame's blended motion pose, so
     * a hand can stay pinned to a world point while the body walks.
     */
    setIkTarget(request) {
        const id = request.id ?? request.limb ?? `${request.root ?? '?'}->${request.effector ?? '?'}`;
        this.ikRequests.set(id, { ...request, id });
        return id;
    }
    clearIkTarget(id) {
        return this.ikRequests.delete(id);
    }
    clearIkTargets() {
        this.ikRequests.clear();
        this.lastIkFrames = [];
    }
    /** Install a persistent gaze target; the head/neck chain tracks it every frame. */
    setLookAtTarget(target, options = {}) {
        this.lookAtRequest = { ...options, target };
    }
    clearLookAtTarget() {
        this.lookAtRequest = null;
        this.lastLookAtFrame = null;
    }
    /** Advance the runtime by `dt` seconds and produce the pose for this frame. */
    tick(dt) {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
        this.clock += step;
        this.frames += 1;
        const plan = this.activePlan;
        if (!plan) {
            const restLayered = this.applyConstraints([]);
            return {
                time: this.clock,
                poses: restLayered.poses,
                command: null,
                kind: 'rest',
                blend: 1,
                blending: false,
                continuous: false,
                bones: restLayered.poses.map((p) => p.name).sort(),
                ik: restLayered.ik,
                lookAt: restLayered.lookAt,
            };
        }
        const continuous = CONTINUOUS_KINDS.has(plan.kind);
        if (continuous && this.activeCommand) {
            // Re-compile with an advancing phase so locomotion actually cycles.
            this.walkPhase = (this.walkPhase + step / Math.max(1e-6, this.config.walkCycleSeconds)) % 1;
            const recompiled = this.compiler.compile(withPhase(this.activeCommand, this.walkPhase), this.skeleton);
            if (recompiled.kind === plan.kind)
                this.activePlan = recompiled;
        }
        if (this.blendDuration > 0 && this.blendElapsed < this.blendDuration) {
            this.blendElapsed = Math.min(this.blendDuration, this.blendElapsed + step);
        }
        const blend = this.blendDuration > 0 ? this.blendElapsed / this.blendDuration : 1;
        const poses = blendPoses(this.fromPoses, this.activePlan.poses, blend);
        if (blend >= 1) {
            // Fade finished: the target pose becomes the new outgoing pose.
            this.fromPoses = poses;
            this.blendDuration = 0;
            if (this.activePlan.kind === 'neutral') {
                this.activePlan = null;
                this.activeCommand = null;
            }
        }
        // Constraints layer on top of the blended motion. `fromPoses` deliberately
        // keeps the *unconstrained* pose so cross-fades stay pure motion maths and a
        // pinned hand never bakes itself into the next gesture's start pose.
        const layered = this.applyConstraints(poses);
        return {
            time: this.clock,
            poses: layered.poses,
            command: this.activeCommand,
            kind: this.activePlan?.kind ?? 'rest',
            blend: Math.min(1, blend),
            blending: blend < 1,
            continuous,
            bones: layered.poses.map((p) => p.name).sort(),
            ik: layered.ik,
            lookAt: layered.lookAt,
        };
    }
    /**
     * Solve every active IK constraint, then the gaze, against `poses`.
     * Pure with respect to runtime timing: the same pose + constraints always
     * produce the same layered output.
     */
    applyConstraints(poses) {
        let working = poses;
        const ikFrames = [];
        for (const [id, request] of this.ikRequests) {
            const shared = {
                poleVector: request.poleVector,
                tolerance: request.tolerance,
                iterations: request.iterations,
                passes: request.passes,
                respectLimits: request.respectLimits,
                basePoses: working,
            };
            let result;
            if (request.limb) {
                result = solveLimbIK(this.skeleton, request.limb, request.target, shared);
            }
            else if (request.root && request.effector) {
                result = solveChainIK(this.skeleton, request.root, request.effector, {
                    ...shared,
                    target: request.target,
                });
            }
            else {
                continue;
            }
            working = result.mergedPoses;
            ikFrames.push({
                id,
                chain: result.chain,
                target: { ...request.target },
                error: result.error,
                reached: result.reached,
                targetUnreachable: result.targetUnreachable,
            });
        }
        let lookAtFrame = null;
        if (this.lookAtRequest) {
            const gaze = solveLookAtChain(this.skeleton, {
                ...this.lookAtRequest,
                basePoses: working,
            });
            working = gaze.mergedPoses;
            lookAtFrame = {
                target: { ...this.lookAtRequest.target },
                chain: gaze.chain,
                angleErrorDeg: gaze.angleErrorDeg,
                clamped: gaze.clamped,
            };
        }
        this.lastIkFrames = ikFrames;
        this.lastLookAtFrame = lookAtFrame;
        return { poses: working, ik: ikFrames, lookAt: lookAtFrame };
    }
    /** Pose as of the last tick (used as the source of the next cross-fade). */
    currentPoses() {
        if (!this.activePlan)
            return this.fromPoses.map(clonePose);
        const blend = this.blendDuration > 0 ? this.blendElapsed / this.blendDuration : 1;
        return blendPoses(this.fromPoses, this.activePlan.poses, blend);
    }
    status() {
        const blend = this.blendDuration > 0 ? this.blendElapsed / this.blendDuration : 1;
        return {
            time: this.clock,
            activeCommand: this.activeCommand,
            activeKind: this.activePlan?.kind ?? 'rest',
            blending: blend < 1,
            blend: Math.min(1, blend),
            accepted: this.accepted,
            rejected: this.rejections.length,
            frames: this.frames,
            rejections: [...this.rejections],
            ikConstraints: this.lastIkFrames.map((f) => ({ ...f, target: { ...f.target } })),
            lookAt: this.lastLookAtFrame
                ? { ...this.lastLookAtFrame, target: { ...this.lastLookAtFrame.target } }
                : null,
        };
    }
    reset() {
        this.clock = 0;
        this.frames = 0;
        this.accepted = 0;
        this.rejections = [];
        this.fromPoses = [];
        this.activePlan = null;
        this.activeCommand = null;
        this.blendElapsed = 0;
        this.blendDuration = 0;
        this.walkPhase = 0;
        this.ikRequests.clear();
        this.lastIkFrames = [];
        this.lookAtRequest = null;
        this.lastLookAtFrame = null;
    }
}
/** Rewrite/insert a `phase <n>` token so continuous plans can advance. */
export function withPhase(command, phase) {
    const value = phase.toFixed(4);
    return /phase\s+[-\d.]+/i.test(command)
        ? command.replace(/phase\s+[-\d.]+/i, `phase ${value}`)
        : `${command} phase ${value}`;
}
/**
 * Blend two pose sets by bone name. Bones present in only one side fade against
 * their own identity, so a gesture that touches the right arm never snaps the
 * left one.
 */
export function blendPoses(from, to, t) {
    const clamped = Math.max(0, Math.min(1, t));
    const names = [];
    const fromMap = new Map();
    const toMap = new Map();
    for (const p of from) {
        fromMap.set(p.name, p);
        names.push(p.name);
    }
    for (const p of to) {
        toMap.set(p.name, p);
        if (!fromMap.has(p.name))
            names.push(p.name);
    }
    const out = [];
    for (const name of names) {
        const a = fromMap.get(name) ?? identityPose(name);
        const b = toMap.get(name) ?? identityPose(name);
        out.push({
            name,
            localPos: {
                x: a.localPos.x + (b.localPos.x - a.localPos.x) * clamped,
                y: a.localPos.y + (b.localPos.y - a.localPos.y) * clamped,
                z: a.localPos.z + (b.localPos.z - a.localPos.z) * clamped,
            },
            localRot: nlerp(a.localRot, b.localRot, clamped),
        });
    }
    return out;
}
function identityPose(name) {
    return { name, localPos: { x: 0, y: 0, z: 0 }, localRot: { x: 0, y: 0, z: 0, w: 1 } };
}
function clonePose(p) {
    return { name: p.name, localPos: { ...p.localPos }, localRot: { ...p.localRot } };
}
//# sourceMappingURL=motion-runtime.js.map