import { KioskRandom, clamp01, smoothstep } from './kiosk-random.js';

/**
 * BlinkController — kiosk-grade blink quality.
 *
 * A blink that is a single symmetric triangle every N seconds reads as robotic
 * immediately. This controller reproduces the properties an observer actually
 * notices:
 *
 *   - asymmetric lid curve: fast closing (~90ms), short hold, slower reopen,
 *   - log-normal-ish interval spread instead of a fixed period,
 *   - state-dependent rate (listening blinks less, thinking blinks more),
 *   - occasional double blinks,
 *   - speech-locked suppression so a blink never lands inside a wide-eye or a
 *     mid-viseme accent,
 *   - a deliberate blink on demand (`requestBlink`) for attention beats.
 *
 * The controller owns no rendering: `tick` returns the lid closure and the
 * caller writes `expression.blink*` (see `applyTo`).
 */

export type KioskAttentionState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface BlinkConfig {
  /** Shortest gap between blinks, seconds. */
  minInterval: number;
  /** Longest gap between blinks, seconds. */
  maxInterval: number;
  /** Lid close time, seconds. */
  closeDuration: number;
  /** Fully-closed hold, seconds. */
  holdDuration: number;
  /** Lid reopen time, seconds (longer than close, as in real blinks). */
  openDuration: number;
  /** Probability that a blink is immediately followed by a second one. */
  doubleBlinkChance: number;
  /** Gap before the second blink of a double, seconds. */
  doubleBlinkGap: number;
  /** Per-state multiplier on the interval (>1 = blinks less often). */
  rateByState: Record<KioskAttentionState, number>;
  /** Small left/right timing offset so both lids are not mathematically identical. */
  asymmetry: number;
  seed: number;
}

export const DEFAULT_BLINK_CONFIG: BlinkConfig = {
  minInterval: 1.9,
  maxInterval: 6.4,
  closeDuration: 0.09,
  holdDuration: 0.035,
  openDuration: 0.16,
  doubleBlinkChance: 0.14,
  doubleBlinkGap: 0.22,
  rateByState: { idle: 1, listening: 1.35, thinking: 0.8, speaking: 1.1 },
  asymmetry: 0.012,
  seed: 0x5b11,
};

export type BlinkPhase = 'open' | 'closing' | 'held' | 'opening';

export interface BlinkFrame {
  /** 0 = eyes open, 1 = fully closed. */
  closure: number;
  /** Per-eye closure (slightly desynchronised). */
  left: number;
  right: number;
  phase: BlinkPhase;
  /** Seconds until the next scheduled blink starts (0 while blinking). */
  timeToNext: number;
  /** True on the frame a blink starts. */
  started: boolean;
  /** Completed blinks since construction/reset. */
  count: number;
}

export interface BlinkApplyTarget {
  set(path: string, value: number): void;
}

export class BlinkController {
  private readonly config: BlinkConfig;
  private readonly random: KioskRandom;

  private countdown = 0;
  private elapsed = 0;
  private active = false;
  private pendingDouble = false;
  private blinks = 0;
  private suppressed = 0;

  constructor(config: Partial<BlinkConfig> = {}) {
    this.config = { ...DEFAULT_BLINK_CONFIG, ...config };
    this.random = new KioskRandom(this.config.seed);
    this.countdown = this.scheduleInterval('idle');
  }

  get blinkCount(): number {
    return this.blinks;
  }

  /** Blink as soon as the current blink (if any) finishes. */
  requestBlink(): void {
    if (this.active) this.pendingDouble = true;
    else this.countdown = 0;
  }

  /** Hold the lids open for `seconds` (wide-eye, viseme accent, camera check). */
  suppress(seconds: number): void {
    this.suppressed = Math.max(this.suppressed, Math.max(0, seconds));
  }

  reset(): void {
    this.random.reseed(this.config.seed);
    this.countdown = this.scheduleInterval('idle');
    this.elapsed = 0;
    this.active = false;
    this.pendingDouble = false;
    this.blinks = 0;
    this.suppressed = 0;
  }

  tick(dt: number, state: KioskAttentionState = 'idle'): BlinkFrame {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    let started = false;

    if (this.suppressed > 0) {
      this.suppressed = Math.max(0, this.suppressed - step);
      if (!this.active) {
        // Keep the schedule from firing the instant suppression lifts.
        this.countdown = Math.max(this.countdown, 0.12);
      }
    }

    if (this.active) {
      this.elapsed += step;
      if (this.elapsed >= this.blinkDuration()) {
        this.active = false;
        this.elapsed = 0;
        this.blinks += 1;
        if (this.pendingDouble) {
          this.pendingDouble = false;
          this.countdown = this.config.doubleBlinkGap;
        } else if (this.random.chance(this.config.doubleBlinkChance)) {
          this.countdown = this.config.doubleBlinkGap;
        } else {
          this.countdown = this.scheduleInterval(state);
        }
      }
    } else {
      this.countdown -= step;
      if (this.countdown <= 0 && this.suppressed <= 0) {
        this.active = true;
        this.elapsed = 0;
        this.countdown = 0;
        started = true;
      }
    }

    const closure = this.active ? this.curve(this.elapsed) : 0;
    const offset = this.config.asymmetry;
    const left = this.active ? this.curve(this.elapsed - offset) : 0;
    const right = this.active ? this.curve(this.elapsed + offset) : 0;

    return {
      closure,
      left,
      right,
      phase: this.phase(),
      timeToNext: this.active ? 0 : Math.max(0, this.countdown),
      started,
      count: this.blinks,
    };
  }

  /** Write the frame onto a definition-like target as ARKit blink controls. */
  applyTo(target: BlinkApplyTarget, frame: BlinkFrame): void {
    target.set('expression.blinkLeft', clamp01(frame.left));
    target.set('expression.blinkRight', clamp01(frame.right));
  }

  private blinkDuration(): number {
    const c = this.config;
    return c.closeDuration + c.holdDuration + c.openDuration;
  }

  private phase(): BlinkPhase {
    if (!this.active) return 'open';
    const c = this.config;
    if (this.elapsed < c.closeDuration) return 'closing';
    if (this.elapsed < c.closeDuration + c.holdDuration) return 'held';
    return 'opening';
  }

  /** Asymmetric lid curve: eased close, flat hold, slower eased reopen. */
  private curve(t: number): number {
    const c = this.config;
    if (t <= 0) return 0;
    if (t < c.closeDuration) return smoothstep(t / c.closeDuration);
    const held = c.closeDuration + c.holdDuration;
    if (t < held) return 1;
    const openT = (t - held) / c.openDuration;
    if (openT >= 1) return 0;
    return 1 - smoothstep(openT);
  }

  /** Spread intervals with two samples (bias toward the shorter end, long tail). */
  private scheduleInterval(state: KioskAttentionState): number {
    const c = this.config;
    const scale = c.rateByState[state] ?? 1;
    const a = this.random.next();
    const b = this.random.next();
    const skewed = Math.min(a, b) * 0.65 + a * b * 0.35;
    return (c.minInterval + (c.maxInterval - c.minInterval) * skewed) * scale;
  }
}
