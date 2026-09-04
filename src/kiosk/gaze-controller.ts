import type { Vec3 } from '../core/math/vec.js';
import type { KioskAttentionState } from './blink-controller.js';
import { KioskRandom, clamp01, smoothstep } from './kiosk-random.js';

/**
 * GazeController — where the kiosk human is looking, and how it gets there.
 *
 * The IK look-at solver already exists; what was missing is *behaviour*: a bare
 * look-at target pinned to the camera stares, which is the single most uncanny
 * thing a kiosk avatar can do. This controller produces a moving gaze point:
 *
 *   - an attention anchor (the visitor's face, supplied by person detection),
 *   - micro-saccades: small, quick jumps around the anchor with dwell times,
 *   - eye-contact rhythm: periodic brief breaks so contact is not continuous,
 *   - aversion while thinking (up/side, the natural "recalling" direction),
 *   - a smoothed pursuit path so the head never snaps between targets,
 *   - graceful fallback to a straight-ahead anchor when no visitor is detected.
 */

export interface GazeConfig {
  /** Default anchor when no visitor is tracked (straight ahead, eye height). */
  defaultAnchor: Vec3;
  /** Radius of micro-saccade offsets, world units. */
  saccadeRadius: number;
  /** Dwell range between saccades, seconds. */
  minDwell: number;
  maxDwell: number;
  /** Seconds of eye contact before a short break. */
  contactDuration: number;
  /** Length of a contact break, seconds. */
  breakDuration: number;
  /** Offset applied during a contact break. */
  breakOffset: Vec3;
  /** Offset applied while thinking (gaze aversion). */
  thinkingOffset: Vec3;
  /** Smoothing time constant for pursuit, seconds (larger = lazier head). */
  smoothing: number;
  /** Per-state gaze intensity handed to the look-at solver. */
  intensityByState: Record<KioskAttentionState, number>;
  seed: number;
}

export const DEFAULT_GAZE_CONFIG: GazeConfig = {
  defaultAnchor: { x: 0, y: 1.62, z: 1.6 },
  saccadeRadius: 0.05,
  minDwell: 0.5,
  maxDwell: 2.1,
  contactDuration: 5.5,
  breakDuration: 1.1,
  breakOffset: { x: 0.22, y: -0.1, z: 0 },
  thinkingOffset: { x: 0.2, y: 0.26, z: -0.15 },
  smoothing: 0.18,
  intensityByState: { idle: 0.55, listening: 0.95, thinking: 0.6, speaking: 0.85 },
  seed: 0x9a17,
};

export type GazeMode = 'contact' | 'break' | 'averted' | 'ambient';

export interface GazeFrame {
  /** Smoothed world-space point to hand to the look-at solver. */
  target: Vec3;
  /** Un-smoothed desired point (useful for tests/telemetry). */
  desired: Vec3;
  mode: GazeMode;
  /** 0..1 look-at blend for the current state. */
  intensity: number;
  /** True when a visitor anchor is currently tracked. */
  tracking: boolean;
  /** Saccades performed since construction/reset. */
  saccades: number;
}

export class GazeController {
  private readonly config: GazeConfig;
  private readonly random: KioskRandom;

  private anchor: Vec3 | null = null;
  private saccade: Vec3 = { x: 0, y: 0, z: 0 };
  private dwell = 0;
  private contactElapsed = 0;
  private breakElapsed = 0;
  private breaking = false;
  private smoothed: Vec3;
  private saccades = 0;

  constructor(config: Partial<GazeConfig> = {}) {
    this.config = { ...DEFAULT_GAZE_CONFIG, ...config };
    this.random = new KioskRandom(this.config.seed);
    this.smoothed = { ...this.config.defaultAnchor };
    this.dwell = this.random.range(this.config.minDwell, this.config.maxDwell);
  }

  /** Person detection feeds the visitor's head position here (or null when lost). */
  setAttentionAnchor(anchor: Vec3 | null): void {
    this.anchor = anchor ? { ...anchor } : null;
  }

  /** Force immediate eye contact (used when a visitor arrives or interrupts). */
  reacquire(): void {
    this.breaking = false;
    this.breakElapsed = 0;
    this.contactElapsed = 0;
    this.saccade = { x: 0, y: 0, z: 0 };
    this.dwell = this.random.range(this.config.minDwell, this.config.maxDwell);
  }

  reset(): void {
    this.random.reseed(this.config.seed);
    this.anchor = null;
    this.saccade = { x: 0, y: 0, z: 0 };
    this.contactElapsed = 0;
    this.breakElapsed = 0;
    this.breaking = false;
    this.saccades = 0;
    this.smoothed = { ...this.config.defaultAnchor };
    this.dwell = this.random.range(this.config.minDwell, this.config.maxDwell);
  }

  tick(dt: number, state: KioskAttentionState = 'idle'): GazeFrame {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const c = this.config;
    const tracking = this.anchor !== null;
    const base = this.anchor ?? c.defaultAnchor;

    // Saccade scheduling.
    this.dwell -= step;
    if (this.dwell <= 0) {
      const r = c.saccadeRadius;
      this.saccade = {
        x: this.random.signed(r),
        y: this.random.signed(r * 0.6),
        z: this.random.signed(r * 0.3),
      };
      this.dwell = this.random.range(c.minDwell, c.maxDwell);
      this.saccades += 1;
    }

    // Eye-contact rhythm — only meaningful while a visitor is tracked.
    let mode: GazeMode = tracking ? 'contact' : 'ambient';
    if (state === 'thinking') {
      mode = 'averted';
      this.contactElapsed = 0;
      this.breaking = false;
      this.breakElapsed = 0;
    } else if (tracking) {
      if (this.breaking) {
        this.breakElapsed += step;
        mode = 'break';
        if (this.breakElapsed >= c.breakDuration) {
          this.breaking = false;
          this.breakElapsed = 0;
          this.contactElapsed = 0;
        }
      } else {
        this.contactElapsed += step;
        if (this.contactElapsed >= c.contactDuration) {
          this.breaking = true;
          this.breakElapsed = 0;
          mode = 'break';
        }
      }
    }

    const offset =
      mode === 'averted'
        ? c.thinkingOffset
        : mode === 'break'
          ? c.breakOffset
          : { x: 0, y: 0, z: 0 };

    const desired: Vec3 = {
      x: base.x + this.saccade.x + offset.x,
      y: base.y + this.saccade.y + offset.y,
      z: base.z + this.saccade.z + offset.z,
    };

    // Critically-damped-ish pursuit: exponential approach, framerate independent.
    const alpha = c.smoothing <= 0 ? 1 : clamp01(1 - Math.exp(-step / c.smoothing));
    const eased = smoothstep(alpha);
    this.smoothed = {
      x: this.smoothed.x + (desired.x - this.smoothed.x) * eased,
      y: this.smoothed.y + (desired.y - this.smoothed.y) * eased,
      z: this.smoothed.z + (desired.z - this.smoothed.z) * eased,
    };

    return {
      target: { ...this.smoothed },
      desired,
      mode,
      intensity: c.intensityByState[state] ?? 0.7,
      tracking,
      saccades: this.saccades,
    };
  }
}
