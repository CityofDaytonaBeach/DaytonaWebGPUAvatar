import type { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../skeleton/skeletal-animation.js';
import { nlerp } from '../skeleton/skeletal-animation.js';
import {
  MotionCompiler,
  validateMotion,
  type MotionCompilerConfig,
  type MotionPlan,
  type ValidationResult,
} from './motion-compiler.js';

/**
 * MotionRuntime — the integration layer that puts the (previously standalone)
 * motion compiler *inside* the animation path.
 *
 * The compiler is a pure command -> `MotionPlan` function: it has no notion of
 * time, of the pose currently on the character, or of what happens when a second
 * command arrives mid-gesture. That is exactly the gap that kept `motionCompiler`
 * at PROTOTYPE. This runtime supplies the missing frame loop:
 *
 *   - `push(command)` compiles + validates a command and queues it,
 *   - `tick(dt)` advances a deterministic clock, cross-fades from the outgoing
 *     pose into the new plan over `blendDuration`, and returns the pose to apply,
 *   - continuous plans (walk) are re-compiled per frame with an advancing phase,
 *   - invalid or unknown plans are rejected without disturbing the current pose.
 *
 * Deterministic by construction: the only state is the accumulated clock, so the
 * same command sequence and the same dt sequence always produce identical poses.
 * Nothing here changes the compiler or `SkeletalAnimation`; both are consumed
 * as-is, which keeps clip playback and `Human.perform()` working unchanged.
 */

export interface MotionRuntimeConfig {
  /** Fallback cross-fade seconds when a plan carries no blendDuration. */
  defaultBlendDuration: number;
  /** Reject plans whose confidence falls below this. */
  minConfidence: number;
  /** Reject plans that fail `validateMotion` (joint limits, unknown bones). */
  requireValidation: boolean;
  /** Walk cycle seconds per full stride, used to advance the walk phase. */
  walkCycleSeconds: number;
  /** Compiler configuration forwarded to the underlying MotionCompiler. */
  compiler?: Partial<MotionCompilerConfig>;
}

export const DEFAULT_MOTION_RUNTIME_CONFIG: MotionRuntimeConfig = {
  defaultBlendDuration: 0.3,
  minConfidence: 0.2,
  requireValidation: true,
  walkCycleSeconds: 1.1,
};

export interface MotionRejection {
  command: string;
  reason: string;
  kind: MotionPlan['kind'];
  confidence: number;
  validation: ValidationResult | null;
}

export interface MotionRuntimeFrame {
  /** Accumulated runtime clock in seconds. */
  time: number;
  poses: BonePose[];
  /** Command driving the frame, or null while at rest. */
  command: string | null;
  kind: MotionPlan['kind'] | 'rest';
  /** 0..1 progress of the active cross-fade (1 = fully blended in). */
  blend: number;
  blending: boolean;
  continuous: boolean;
  /** Bones written this frame (stable, sorted). */
  bones: string[];
}

export interface MotionRuntimeStatus {
  time: number;
  activeCommand: string | null;
  activeKind: MotionPlan['kind'] | 'rest';
  blending: boolean;
  blend: number;
  accepted: number;
  rejected: number;
  frames: number;
  rejections: MotionRejection[];
}

const CONTINUOUS_KINDS: ReadonlySet<MotionPlan['kind']> = new Set(['walk']);

export class MotionRuntime {
  private readonly compiler: MotionCompiler;
  private readonly config: MotionRuntimeConfig;

  private clock = 0;
  private frames = 0;
  private accepted = 0;
  private rejections: MotionRejection[] = [];

  /** Pose the runtime is fading away from (the last fully applied pose). */
  private fromPoses: BonePose[] = [];
  private activePlan: MotionPlan | null = null;
  private activeCommand: string | null = null;
  private blendElapsed = 0;
  private blendDuration = 0;
  private walkPhase = 0;

  constructor(
    private readonly skeleton: BoneDef[],
    config: Partial<MotionRuntimeConfig> = {},
  ) {
    this.config = { ...DEFAULT_MOTION_RUNTIME_CONFIG, ...config };
    this.compiler = new MotionCompiler(this.config.compiler);
  }

  get time(): number {
    return this.clock;
  }

  /** Compile, validate, and install a command as the new target motion. */
  push(command: string): { accepted: boolean; plan: MotionPlan; rejection?: MotionRejection } {
    const plan = this.compiler.compile(command, this.skeleton);
    const validation = this.config.requireValidation ? validateMotion(plan, this.skeleton) : null;

    const reason =
      plan.kind === 'unknown'
        ? (plan.reason ?? 'unrecognized command')
        : plan.confidence < this.config.minConfidence
          ? `confidence ${plan.confidence.toFixed(2)} below ${this.config.minConfidence}`
          : validation && !validation.valid
            ? `validation failed: ${validation.violations.join('; ')}`
            : null;

    if (reason !== null) {
      const rejection: MotionRejection = {
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
    if (plan.kind === 'walk') this.walkPhase = 0;
    this.accepted += 1;
    return { accepted: true, plan };
  }

  /** Return to rest, cross-fading out of the active motion. */
  release(): void {
    if (!this.activePlan) return;
    this.fromPoses = this.currentPoses();
    this.activePlan = { kind: 'neutral', confidence: 1, poses: [] };
    this.activeCommand = null;
    this.blendDuration = this.config.defaultBlendDuration;
    this.blendElapsed = 0;
  }

  /** Advance the runtime by `dt` seconds and produce the pose for this frame. */
  tick(dt: number): MotionRuntimeFrame {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.clock += step;
    this.frames += 1;

    const plan = this.activePlan;
    if (!plan) {
      return {
        time: this.clock,
        poses: [],
        command: null,
        kind: 'rest',
        blend: 1,
        blending: false,
        continuous: false,
        bones: [],
      };
    }

    const continuous = CONTINUOUS_KINDS.has(plan.kind);
    if (continuous && this.activeCommand) {
      // Re-compile with an advancing phase so locomotion actually cycles.
      this.walkPhase = (this.walkPhase + step / Math.max(1e-6, this.config.walkCycleSeconds)) % 1;
      const recompiled = this.compiler.compile(
        withPhase(this.activeCommand, this.walkPhase),
        this.skeleton,
      );
      if (recompiled.kind === plan.kind) this.activePlan = recompiled;
    }

    if (this.blendDuration > 0 && this.blendElapsed < this.blendDuration) {
      this.blendElapsed = Math.min(this.blendDuration, this.blendElapsed + step);
    }
    const blend = this.blendDuration > 0 ? this.blendElapsed / this.blendDuration : 1;
    const poses = blendPoses(this.fromPoses, this.activePlan!.poses, blend);

    if (blend >= 1) {
      // Fade finished: the target pose becomes the new outgoing pose.
      this.fromPoses = poses;
      this.blendDuration = 0;
      if (this.activePlan!.kind === 'neutral') {
        this.activePlan = null;
        this.activeCommand = null;
      }
    }

    return {
      time: this.clock,
      poses,
      command: this.activeCommand,
      kind: this.activePlan?.kind ?? 'rest',
      blend: Math.min(1, blend),
      blending: blend < 1,
      continuous,
      bones: poses.map((p) => p.name).sort(),
    };
  }

  /** Pose as of the last tick (used as the source of the next cross-fade). */
  currentPoses(): BonePose[] {
    if (!this.activePlan) return this.fromPoses.map(clonePose);
    const blend = this.blendDuration > 0 ? this.blendElapsed / this.blendDuration : 1;
    return blendPoses(this.fromPoses, this.activePlan.poses, blend);
  }

  status(): MotionRuntimeStatus {
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
    };
  }

  reset(): void {
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
  }
}

/** Rewrite/insert a `phase <n>` token so continuous plans can advance. */
export function withPhase(command: string, phase: number): string {
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
export function blendPoses(from: BonePose[], to: BonePose[], t: number): BonePose[] {
  const clamped = Math.max(0, Math.min(1, t));
  const names: string[] = [];
  const fromMap = new Map<string, BonePose>();
  const toMap = new Map<string, BonePose>();
  for (const p of from) {
    fromMap.set(p.name, p);
    names.push(p.name);
  }
  for (const p of to) {
    toMap.set(p.name, p);
    if (!fromMap.has(p.name)) names.push(p.name);
  }

  const out: BonePose[] = [];
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

function identityPose(name: string): BonePose {
  return { name, localPos: { x: 0, y: 0, z: 0 }, localRot: { x: 0, y: 0, z: 0, w: 1 } };
}

function clonePose(p: BonePose): BonePose {
  return { name: p.name, localPos: { ...p.localPos }, localRot: { ...p.localRot } };
}
