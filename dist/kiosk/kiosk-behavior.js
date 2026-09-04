import { BlinkController, DEFAULT_BLINK_CONFIG, } from './blink-controller.js';
import { GazeController, DEFAULT_GAZE_CONFIG, } from './gaze-controller.js';
import { IdleMotion, DEFAULT_IDLE_MOTION_CONFIG, } from './idle-motion.js';
import { clamp01 } from './kiosk-random.js';
export const DEFAULT_KIOSK_BEHAVIOR_CONFIG = {
    blink: {},
    gaze: {},
    idle: {},
    maxThinkingSeconds: 12,
    visitorTimeout: 3,
    interruptAcknowledgeSeconds: 0.6,
    interruptGesture: 'nod',
};
export class KioskBehavior {
    config;
    blinkController;
    gazeController;
    idleMotion;
    state = 'idle';
    stateElapsed = 0;
    clock = 0;
    frames = 0;
    interruptions = 0;
    acknowledging = 0;
    visitorPresent = false;
    visitorLostFor = 0;
    thinkingElapsed = 0;
    speechEnergy = 0;
    gestureCount = 0;
    saccadeCount = 0;
    constructor(config = {}) {
        this.config = { ...DEFAULT_KIOSK_BEHAVIOR_CONFIG, ...config };
        this.blinkController = new BlinkController({ ...DEFAULT_BLINK_CONFIG, ...this.config.blink });
        this.gazeController = new GazeController({ ...DEFAULT_GAZE_CONFIG, ...this.config.gaze });
        this.idleMotion = new IdleMotion({ ...DEFAULT_IDLE_MOTION_CONFIG, ...this.config.idle });
    }
    get currentState() {
        return this.state;
    }
    get blink() {
        return this.blinkController;
    }
    get gaze() {
        return this.gazeController;
    }
    // ─── events ────────────────────────────────────────────────────────────────
    /** Person detection: a visitor's head position, or null when nobody is there. */
    setVisitor(anchor) {
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
    listen() {
        this.transition('listening');
        this.gazeController.reacquire();
    }
    /** The query is being answered by the RAG pipeline. */
    think() {
        this.thinkingElapsed = 0;
        this.transition('thinking');
    }
    /** Speech playback started. */
    speak() {
        this.transition('speaking');
        // Never blink into the first syllable.
        this.blinkController.suppress(0.25);
    }
    /** Speech finished naturally. */
    finishSpeaking() {
        this.speechEnergy = 0;
        this.transition(this.visitorPresent ? 'listening' : 'idle');
    }
    /**
     * The visitor talked over the avatar. Cut speech, re-acquire eye contact,
     * suppress the in-flight gesture, and acknowledge briefly before listening.
     */
    interrupt() {
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
    setSpeechEnergy(energy) {
        this.speechEnergy = clamp01(energy);
    }
    reset() {
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
    tick(dt) {
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
        let forcedGesture = null;
        if (this.acknowledging > 0) {
            interrupting = true;
            if (this.acknowledging === this.config.interruptAcknowledgeSeconds) {
                forcedGesture = this.config.interruptGesture;
            }
            this.acknowledging = Math.max(0, this.acknowledging - step);
            if (this.acknowledging === 0)
                this.idleMotion.setGesturesEnabled(true);
        }
        this.idleMotion.setState(this.state);
        this.idleMotion.setSpeechEnergy(this.state === 'speaking' ? this.speechEnergy : 0);
        const blink = this.blinkController.tick(step, this.state);
        const gaze = this.gazeController.tick(step, this.state);
        const idle = this.idleMotion.tick(step);
        this.gestureCount = idle.gestureCount;
        this.saccadeCount = gaze.saccades;
        const expression = { ...idle.expression };
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
    apply(frame, definition, motion) {
        if (definition) {
            for (const [path, value] of Object.entries(frame.expression))
                definition.set(path, value);
        }
        if (motion) {
            motion.setLookAtTarget(frame.lookAtTarget, { intensity: frame.lookAtIntensity });
            if (frame.gesture && typeof motion.push === 'function')
                motion.push(frame.gesture);
        }
    }
    status() {
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
    transition(next) {
        if (this.state === next)
            return;
        this.state = next;
        this.stateElapsed = 0;
        if (next !== 'thinking')
            this.thinkingElapsed = 0;
    }
}
//# sourceMappingURL=kiosk-behavior.js.map