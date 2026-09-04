import type { KioskAttentionState } from './blink-controller.js';
import { KioskRandom, clamp01, smoothstep } from './kiosk-random.js';

/**
 * IdleMotion — the "is it alive?" layer.
 *
 * A kiosk human that only moves when speaking looks like a paused video. This
 * module produces the continuous, low-amplitude motion an observer reads as
 * life, plus the per-state postural signature:
 *
 *   - breathing: chest/shoulder rise on a slow asymmetric cycle,
 *   - head drift: three incommensurate sines per axis (never a visible loop),
 *   - weight shift: very slow lateral sway of the hips,
 *   - listening posture: slight forward lean, head tilt, brow raise,
 *   - thinking posture: head down/aside, brow furrow,
 *   - speaking accents: head nods driven by supplied speech energy,
 *   - small gestures: occasional nods/shrugs scheduled per state.
 *
 * Output is a small pose description (angles in radians + expression controls)
 * plus an optional motion command; the behaviour layer routes those to the
 * MotionRuntime and the definition.
 */

export interface IdleMotionConfig {
  /** Breaths per minute. */
  breathRate: number;
  /** Breath amplitude, 0..1. */
  breathAmplitude: number;
  /** Head drift amplitude in radians. */
  headDrift: number;
  /** Lateral weight-shift amplitude in radians. */
  swayAmplitude: number;
  /** Weight-shift period, seconds. */
  swayPeriod: number;
  /** Per-state amplitude multiplier on the drift/sway layer. */
  amplitudeByState: Record<KioskAttentionState, number>;
  /** Mean seconds between small gestures, per state (0 disables). */
  gestureIntervalByState: Record<KioskAttentionState, number>;
  /** Gesture commands eligible per state. */
  gesturesByState: Record<KioskAttentionState, readonly string[]>;
  /** Seconds to cross-fade between postures. */
  postureBlend: number;
  seed: number;
}

export const DEFAULT_IDLE_MOTION_CONFIG: IdleMotionConfig = {
  breathRate: 13,
  breathAmplitude: 0.55,
  headDrift: 0.035,
  swayAmplitude: 0.02,
  swayPeriod: 9.3,
  amplitudeByState: { idle: 1, listening: 0.7, thinking: 0.85, speaking: 1.15 },
  gestureIntervalByState: { idle: 26, listening: 14, thinking: 18, speaking: 9 },
  gesturesByState: {
    idle: ['shrug', 'nod'],
    listening: ['nod', 'nod head'],
    thinking: ['shrug'],
    speaking: ['nod', 'shrug'],
  },
  postureBlend: 0.45,
  seed: 0x3f27,
};

export interface IdleMotionFrame {
  time: number;
  /** Head rotation offsets in radians. */
  headYaw: number;
  headPitch: number;
  headRoll: number;
  /** Hip lateral sway in radians. */
  sway: number;
  /** 0..1 inhale amount. */
  breath: number;
  /** Forward lean, radians (positive = toward the visitor). */
  lean: number;
  /** Expression controls implied by the posture (brow etc.). */
  expression: Record<string, number>;
  /** Motion command to push this frame, or null. */
  gesture: string | null;
  /** Gestures emitted since construction/reset. */
  gestureCount: number;
}

export class IdleMotion {
  private readonly config: IdleMotionConfig;
  private readonly random: KioskRandom;

  private clock = 0;
  private gestureCountdown: number;
  private gestures = 0;
  private posture: KioskAttentionState = 'idle';
  private postureWeight = 1;
  private previousPosture: KioskAttentionState = 'idle';
  private speechEnergy = 0;
  private gesturesEnabled = true;

  constructor(config: Partial<IdleMotionConfig> = {}) {
    this.config = { ...DEFAULT_IDLE_MOTION_CONFIG, ...config };
    this.random = new KioskRandom(this.config.seed);
    this.gestureCountdown = this.scheduleGesture('idle');
  }

  setState(state: KioskAttentionState): void {
    if (state === this.posture) return;
    this.previousPosture = this.posture;
    this.posture = state;
    this.postureWeight = 0;
    this.gestureCountdown = this.scheduleGesture(state);
  }

  /** 0..1 speech loudness for this frame; drives speaking head accents. */
  setSpeechEnergy(energy: number): void {
    this.speechEnergy = clamp01(energy);
  }

  /** Turn small gestures off (e.g. during an interruption or a scripted beat). */
  setGesturesEnabled(enabled: boolean): void {
    this.gesturesEnabled = enabled;
  }

  reset(): void {
    this.random.reseed(this.config.seed);
    this.clock = 0;
    this.gestures = 0;
    this.posture = 'idle';
    this.previousPosture = 'idle';
    this.postureWeight = 1;
    this.speechEnergy = 0;
    this.gesturesEnabled = true;
    this.gestureCountdown = this.scheduleGesture('idle');
  }

  tick(dt: number): IdleMotionFrame {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.clock += step;
    const c = this.config;

    if (this.postureWeight < 1) {
      this.postureWeight =
        c.postureBlend <= 0 ? 1 : Math.min(1, this.postureWeight + step / c.postureBlend);
    }

    const t = this.clock;
    const amp = this.blend(
      c.amplitudeByState[this.previousPosture] ?? 1,
      c.amplitudeByState[this.posture] ?? 1,
    );

    // Incommensurate periods: the composite never visibly repeats.
    const headYaw =
      c.headDrift * amp * (Math.sin(t * 0.37) * 0.6 + Math.sin(t * 0.113 + 1.7) * 0.4);
    const breath = clamp01(
      0.5 + 0.5 * Math.sin((t * 2 * Math.PI * c.breathRate) / 60 - Math.PI / 2),
    );
    const breathPitch = (breath - 0.5) * 0.012 * c.breathAmplitude;
    const accent = this.posture === 'speaking' ? this.speechEnergy * 0.05 * Math.sin(t * 6.1) : 0;
    const headPitch =
      c.headDrift * amp * 0.6 * Math.sin(t * 0.29 + 0.5) +
      breathPitch +
      accent +
      this.posturePitch();
    const headRoll = c.headDrift * amp * 0.5 * Math.sin(t * 0.211 + 2.4) + this.postureRoll();
    const sway = c.swayAmplitude * amp * Math.sin((t * 2 * Math.PI) / c.swayPeriod);
    const lean = this.blend(this.leanFor(this.previousPosture), this.leanFor(this.posture));

    let gesture: string | null = null;
    const interval = c.gestureIntervalByState[this.posture] ?? 0;
    if (this.gesturesEnabled && interval > 0) {
      this.gestureCountdown -= step;
      if (this.gestureCountdown <= 0) {
        const pool = c.gesturesByState[this.posture] ?? [];
        if (pool.length > 0) {
          gesture = this.random.pick(pool);
          this.gestures += 1;
        }
        this.gestureCountdown = this.scheduleGesture(this.posture);
      }
    }

    return {
      time: t,
      headYaw,
      headPitch,
      headRoll,
      sway,
      breath,
      lean,
      expression: this.postureExpression(breath),
      gesture,
      gestureCount: this.gestures,
    };
  }

  private blend(from: number, to: number): number {
    return from + (to - from) * smoothstep(this.postureWeight);
  }

  private leanFor(state: KioskAttentionState): number {
    switch (state) {
      case 'listening':
        return 0.045;
      case 'thinking':
        return -0.02;
      case 'speaking':
        return 0.02;
      default:
        return 0;
    }
  }

  private postureRoll(): number {
    return this.blend(this.rollFor(this.previousPosture), this.rollFor(this.posture));
  }

  private rollFor(state: KioskAttentionState): number {
    return state === 'listening' ? 0.055 : state === 'thinking' ? -0.03 : 0;
  }

  private posturePitch(): number {
    return this.blend(this.pitchFor(this.previousPosture), this.pitchFor(this.posture));
  }

  private pitchFor(state: KioskAttentionState): number {
    return state === 'thinking' ? 0.06 : state === 'listening' ? -0.015 : 0;
  }

  private postureExpression(breath: number): Record<string, number> {
    const listening = this.weightOf('listening');
    const thinking = this.weightOf('thinking');
    return {
      'expression.browInnerUp': listening * 0.18,
      'expression.browDownLeft': thinking * 0.22,
      'expression.browDownRight': thinking * 0.22,
      'expression.eyeSquintLeft': thinking * 0.14,
      'expression.eyeSquintRight': thinking * 0.14,
      'expression.mouthPucker': thinking * 0.1,
      'expression.cheekSquintLeft': breath * 0.02,
      'expression.cheekSquintRight': breath * 0.02,
    };
  }

  private weightOf(state: KioskAttentionState): number {
    const w = smoothstep(this.postureWeight);
    if (this.posture === state) return w;
    if (this.previousPosture === state) return 1 - w;
    return 0;
  }

  private scheduleGesture(state: KioskAttentionState): number {
    const mean = this.config.gestureIntervalByState[state] ?? 0;
    if (mean <= 0) return Number.POSITIVE_INFINITY;
    return mean * this.random.range(0.6, 1.5);
  }
}
