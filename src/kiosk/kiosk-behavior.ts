import type { Vec3 } from '../core/math/vec.js';
import {
  BlinkController,
  DEFAULT_BLINK_CONFIG,
  type BlinkConfig,
  type BlinkFrame,
  type KioskAttentionState,
} from './blink-controller.js';
import {
  GazeController,
  DEFAULT_GAZE_CONFIG,
  type GazeConfig,
  type GazeFrame,
} from './gaze-controller.js';
import {
  IdleMotion,
  DEFAULT_IDLE_MOTION_CONFIG,
  type IdleMotionConfig,
  type IdleMotionFrame,
} from './idle-motion.js';
import { clamp01 } from './kiosk-random.js';

/**
 * KioskBehavior — the conversational state machine that drives a kiosk human.
 *
 * It owns the four attention states a talking kiosk actually has and composes
 * the blink, gaze and idle-motion layers into one deterministic frame:
 *
 *   idle ──visitor detected──▶ listening ──utterance ended──▶ thinking
 *     ▲                            ▲                              │
 *     └────visitor lost────────────┴──────interrupt()──── speaking ◀┘
 *
 * Interruption is a first-class transition, not an afterthought: `interrupt()`
 * cuts speech immediately, re-acquires eye contact, suppresses the mid-sentence
 * gesture, plays a short acknowledging beat, and returns to listening. That is
 * the behaviour a person expects when they talk over a kiosk.
 *
 * Everything is deterministic: same seeds + same dt sequence + same events =>
 * identical frames, which is what makes the soak harness a usable gate.
 */

export type { KioskAttentionState };

export interface KioskBehaviorConfig {
  blink: Partial<BlinkConfig>;
  gaze: Partial<GazeConfig>;
  idle: Partial<IdleMotionConfig>;
  /** Seconds of "thinking" before speaking begins, when driven by `think()`. */
  maxThinkingSeconds: number;
  /** Seconds after losing the visitor before dropping back to idle. */
  visitorTimeout: number;
  /** Duration of the acknowledging beat after an interruption, seconds. */
  interruptAcknowledgeSeconds: number;
  /** Gesture pushed when acknowledging an interruption. */
  interruptGesture: string;
}

export const DEFAULT_KIOSK_BEHAVIOR_CONFIG: KioskBehaviorConfig = {
  blink: {},
  gaze: {},
  idle: {},
  maxThinkingSeconds: 12,
  visitorTimeout: 3,
  interruptAcknowledgeSeconds: 0.6,
  interruptGesture: 'nod',
};

export interface KioskBehaviorFrame {
  time: number;
  state: KioskAttentionState;
  /** Seconds spent in the current state. */
  stateElapsed: number;
  blink: BlinkFrame;
  gaze: GazeFrame;
  idle: IdleMotionFrame;
  /** Gaze target to feed the look-at solver, already smoothed. */
  lookAtTarget: Vec3;
  lookAtIntensity: number;
  /** Motion command to push this frame, or null. */
  gesture: string | null;
  /** Full expression control set for this frame (blink + posture). */
  expression: Record<string, number>;
  /** True on frames where an interruption was acknowledged. */
  interrupting: boolean;
}

export interface KioskBehaviorStatus {
  time: number;
  state: KioskAttentionState;
  stateElapsed: number;
  frames: number;
  blinks: number;
  gestures: number;
  saccades: number;
  interruptions: number;
  visitorPresent: boolean;
  speaking: boolean;
}

/** Structural targets so the behaviour layer never imports Human directly. */
export interface KioskDefinitionTarget {
  set(path: string, value: number): void;
}

export interface KioskMotionTarget {
  setLookAtTarget(target: Vec3, options?: { intensity?: number }): void;
  push?(command: string): unknown;
  stopSpeaking?(): void;
}

export class KioskBehavior {
  private readonly config: KioskBehaviorConfig;
  private readonly blinkController: BlinkController;
  private readonly gazeController: GazeController;
  private readonly idleMotion: IdleMotion;

  private state: KioskAttentionState = 'idle';
  private stateElapsed = 0;
  private clock = 0;
  private frames = 0;
  private interruptions = 0;
  private acknowledging = 0;
  private visitorPresent = false;
  private visitorLostFor = 0;
  private thinkingElapsed = 0;
  private speechEnergy = 0;
  private gestureCount = 0;
  private saccadeCount = 0;

  constructor(config: Partial<KioskBehaviorConfig> = {}) {
    this.config = { ...DEFAULT_KIOSK_BEHAVIOR_CONFIG, ...config };
    this.blinkController = new BlinkController({ ...DEFAULT_BLINK_CONFIG, ...this.config.blink });
    this.gazeController = new GazeController({ ...DEFAULT_GAZE_CONFIG, ...this.config.gaze });
    this.idleMotion = new IdleMotion({ ...DEFAULT_IDLE_MOTION_CONFIG, ...this.config.idle });
  }

  get currentState(): KioskAttentionState {
    return this.state;
  }

  get blink(): BlinkController {
    return this.blinkController;
  }

  get gaze(): GazeController {
    return this.gazeController;
  }

  // ─── events ────────────────────────────────────────────────────────────────

  /** Person detection: a visitor's head position, or null when nobody is there. */
  setVisitor(anchor: Vec3 | null): void {
    this.gazeController.setAttentionAnchor(anchor);
    const wasPresent = this.visitorPresent;
    this.visitorPresent = anchor !== null;
    if (this.visitorPresent) {
      this.visitorLostFor = 0;
      if (!wasPresent) {
        this.gazeController.reacquire();
        this.blinkController.requestBlink();
        this.transition('listening');
      }
    }
  }

  /** The visitor started talking (or the mic opened). */
  listen(): void {
    this.transition('listening');
    this.gazeController.reacquire();
  }

  /** The query is being answered by the RAG pipeline. */
  think(): void {
    this.thinkingElapsed = 0;
    this.transition('thinking');
  }

  /** Speech playback started. */
  speak(): void {
    this.transition('speaking');
    // Never blink into the first syllable.
    this.blinkController.suppress(0.25);
  }

  /** Speech finished naturally. */
  finishSpeaking(): void {
    this.speechEnergy = 0;
    this.transition(this.visitorPresent ? 'listening' : 'idle');
  }

  /**
   * The visitor talked over the avatar. Cut speech, re-acquire eye contact,
   * suppress the in-flight gesture, and acknowledge briefly before listening.
   */
  interrupt(): boolean {
    const wasSpeaking = this.state === 'speaking' || this.state === 'thinking';
    this.interruptions += 1;
    this.speechEnergy = 0;
    this.acknowledging = this.config.interruptAcknowledgeSeconds;
    this.idleMotion.setGesturesEnabled(false);
    this.gazeController.reacquire();
    this.blinkController.requestBlink();
    this.transition('listening');
    return wasSpeaking;
  }

  /** 0..1 speech loudness for the current frame (drives head accents). */
  setSpeechEnergy(energy: number): void {
    this.speechEnergy = clamp01(energy);
  }

  reset(): void {
    this.blinkController.reset();
    this.gazeController.reset();
    this.idleMotion.reset();
    this.state = 'idle';
    this.stateElapsed = 0;
    this.clock = 0;
    this.frames = 0;
    this.interruptions = 0;
    this.acknowledging = 0;
    this.visitorPresent = false;
    this.visitorLostFor = 0;
    this.thinkingElapsed = 0;
    this.speechEnergy = 0;
    this.gestureCount = 0;
    this.saccadeCount = 0;
  }

  // ─── frame loop ────────────────────────────────────────────────────────────

  tick(dt: number): KioskBehaviorFrame {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.clock += step;
    this.stateElapsed += step;
    this.frames += 1;

    // Visitor timeout: fall back to idle after a grace period.
    if (!this.visitorPresent && this.state !== 'idle' && this.state !== 'speaking') {
      this.visitorLostFor += step;
      if (this.visitorLostFor >= this.config.visitorTimeout) {
        this.transition('idle');
        this.visitorLostFor = 0;
      }
    }

    // Thinking cannot last forever — bail out so the avatar never freezes.
    if (this.state === 'thinking') {
      this.thinkingElapsed += step;
      if (this.thinkingElapsed >= this.config.maxThinkingSeconds) {
        this.transition(this.visitorPresent ? 'listening' : 'idle');
      }
    }

    let interrupting = false;
    let forcedGesture: string | null = null;
    if (this.acknowledging > 0) {
      interrupting = true;
      if (this.acknowledging === this.config.interruptAcknowledgeSeconds) {
        forcedGesture = this.config.interruptGesture;
      }
      this.acknowledging = Math.max(0, this.acknowledging - step);
      if (this.acknowledging === 0) this.idleMotion.setGesturesEnabled(true);
    }

    this.idleMotion.setState(this.state);
    this.idleMotion.setSpeechEnergy(this.state === 'speaking' ? this.speechEnergy : 0);

    const blink = this.blinkController.tick(step, this.state);
    const gaze = this.gazeController.tick(step, this.state);
    const idle = this.idleMotion.tick(step);
    this.gestureCount = idle.gestureCount;
    this.saccadeCount = gaze.saccades;

    const expression: Record<string, number> = { ...idle.expression };
    expression['expression.blinkLeft'] = clamp01(blink.left);
    expression['expression.blinkRight'] = clamp01(blink.right);

    return {
      time: this.clock,
      state: this.state,
      stateElapsed: this.stateElapsed,
      blink,
      gaze,
      idle,
      lookAtTarget: gaze.target,
      lookAtIntensity: gaze.intensity,
      gesture: forcedGesture ?? idle.gesture,
      expression,
      interrupting,
    };
  }

  /** Apply a frame to a definition (expressions) and a motion runtime (gaze/gesture). */
  apply(
    frame: KioskBehaviorFrame,
    definition?: KioskDefinitionTarget | null,
    motion?: KioskMotionTarget | null,
  ): void {
    if (definition) {
      for (const [path, value] of Object.entries(frame.expression)) definition.set(path, value);
    }
    if (motion) {
      motion.setLookAtTarget(frame.lookAtTarget, { intensity: frame.lookAtIntensity });
      if (frame.gesture && typeof motion.push === 'function') motion.push(frame.gesture);
    }
  }

  status(): KioskBehaviorStatus {
    return {
      time: this.clock,
      state: this.state,
      stateElapsed: this.stateElapsed,
      frames: this.frames,
      blinks: this.blinkController.blinkCount,
      gestures: this.gestureCount,
      saccades: this.saccadeCount,
      interruptions: this.interruptions,
      visitorPresent: this.visitorPresent,
      speaking: this.state === 'speaking',
    };
  }

  private transition(next: KioskAttentionState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateElapsed = 0;
    if (next !== 'thinking') this.thinkingElapsed = 0;
  }
}
