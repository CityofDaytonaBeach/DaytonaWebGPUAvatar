import type { Vec3 } from '../core/math/vec.js';
import { BlinkController, type BlinkConfig, type BlinkFrame, type KioskAttentionState } from './blink-controller.js';
import { GazeController, type GazeConfig, type GazeFrame } from './gaze-controller.js';
import { type IdleMotionConfig, type IdleMotionFrame } from './idle-motion.js';
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
export declare const DEFAULT_KIOSK_BEHAVIOR_CONFIG: KioskBehaviorConfig;
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
    setLookAtTarget(target: Vec3, options?: {
        intensity?: number;
    }): void;
    push?(command: string): unknown;
    stopSpeaking?(): void;
}
export declare class KioskBehavior {
    private readonly config;
    private readonly blinkController;
    private readonly gazeController;
    private readonly idleMotion;
    private state;
    private stateElapsed;
    private clock;
    private frames;
    private interruptions;
    private acknowledging;
    private visitorPresent;
    private visitorLostFor;
    private thinkingElapsed;
    private speechEnergy;
    private gestureCount;
    private saccadeCount;
    constructor(config?: Partial<KioskBehaviorConfig>);
    get currentState(): KioskAttentionState;
    get blink(): BlinkController;
    get gaze(): GazeController;
    /** Person detection: a visitor's head position, or null when nobody is there. */
    setVisitor(anchor: Vec3 | null): void;
    /** The visitor started talking (or the mic opened). */
    listen(): void;
    /** The query is being answered by the RAG pipeline. */
    think(): void;
    /** Speech playback started. */
    speak(): void;
    /** Speech finished naturally. */
    finishSpeaking(): void;
    /**
     * The visitor talked over the avatar. Cut speech, re-acquire eye contact,
     * suppress the in-flight gesture, and acknowledge briefly before listening.
     */
    interrupt(): boolean;
    /** 0..1 speech loudness for the current frame (drives head accents). */
    setSpeechEnergy(energy: number): void;
    reset(): void;
    tick(dt: number): KioskBehaviorFrame;
    /** Apply a frame to a definition (expressions) and a motion runtime (gaze/gesture). */
    apply(frame: KioskBehaviorFrame, definition?: KioskDefinitionTarget | null, motion?: KioskMotionTarget | null): void;
    status(): KioskBehaviorStatus;
    private transition;
}
//# sourceMappingURL=kiosk-behavior.d.ts.map