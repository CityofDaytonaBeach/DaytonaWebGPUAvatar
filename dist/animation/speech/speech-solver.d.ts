import { HumanDefinition } from '../../core/schema/human-definition.js';
export type Viseme = 'sil' | 'aa' | 'ee' | 'ih' | 'oh' | 'oo' | 'mm' | 'll' | 'th' | 'ss' | 'kk';
export interface Phoneme {
    viseme: Viseme;
    start: number;
    duration: number;
}
export interface SpeechTrack {
    text: string;
    phonemes: Phoneme[];
    duration: number;
}
export interface SpeechPose {
    jawOpen: number;
    mouthPucker: number;
    mouthSmileLeft: number;
    mouthSmileRight: number;
}
/**
 * Viseme solver with co-articulation. Renders speech into facial controls at
 * time `t`, blending between neighbouring phonemes instead of hard-switching
 * mouth shapes. TTS providers are adapters that produce a SpeechTrack.
 */
export declare class SpeechSolver {
    /**
     * Resolve the co-articulated speech pose at time `t` without touching any
     * definition: a weighted blend of every nearby phoneme's viseme so mouth
     * motion glides between shapes instead of snapping.
     */
    poseAt(track: SpeechTrack, t: number): SpeechPose;
    /** Apply the speech track at time t into the definition (co-articulated). */
    apply(definition: HumanDefinition, track: SpeechTrack, t: number): void;
    /**
     * Blend speech and a persistent expression simultaneously (layering), so the
     * character keeps its resting/allotted expression while talking instead of
     * going dead-faced. `expressionWeight` in [0,1] interpolates each mouth
     * control between the co-articulated speech pose (0) and the base expression
     * already present in the definition (1). The base expression controls are
     * read BEFORE writing, so consecutive calls layer deterministically and a
     * spoken syllable can only push the mouth as far as `1 - expressionWeight`.
     */
    applyWithExpression(definition: HumanDefinition, track: SpeechTrack, t: number, expressionWeight: number): void;
}
/** A tiny deterministic text -> phoneme timeline (v0.1 demo adapter). */
export declare function simpleTTS(text: string): SpeechTrack;
//# sourceMappingURL=speech-solver.d.ts.map