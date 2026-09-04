import { CharacterEvent, EventSource } from '../../core/events/character-event.js';
export type IntentType = 'appearance.modify' | 'appearance.set' | 'expression' | 'pose' | 'speak' | 'wear' | 'tattoo' | 'time.advance' | 'time.transition' | 'unknown';
export interface Intent {
    type: IntentType;
    confidence: number;
    /** Structured changes (validated by the engine, never raw geometry). */
    changes?: Record<string, number>;
    expression?: string;
    text?: string;
    payload?: Record<string, unknown>;
}
export interface PromptInterpreter {
    interpret(prompt: string): Intent;
}
/**
 * Deterministic v0.1 prompt interpreter. Natural language NEVER writes
 * vertices â€” it only produces structured intents that flow through the normal
 * event + constraint + dependency pipeline. The engine, not the AI, decides
 * whether changes are valid.
 */
export declare class DeterministicPromptInterpreter implements PromptInterpreter {
    interpret(prompt: string): Intent;
}
/**
 * Converts an AI Intent into a CharacterEvent. Low-confidence intents make
 * conservative changes (identity budget near zero for appearance.modify).
 */
export declare function intentToEvent(intent: Intent, source?: EventSource): CharacterEvent;
//# sourceMappingURL=interpreter.d.ts.map