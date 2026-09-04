import { HumanDefinition, PrimitiveValue } from '../schema/human-definition.js';
export type EventSource = 'ai' | 'ui' | 'automation' | 'simulation' | 'external' | 'api' | 'developer';
export type CharacterEventType = 'set' | 'adjust' | 'expression' | 'pose' | 'speak' | 'wear' | 'addTattoo' | 'removeAttachment' | 'transition' | 'advanceTime';
/**
 * Central transactional event used by EVERY mutation path (AI, UI,
 * automation, simulation, external API, timeline). There is no separate
 * mutation system.
 */
export interface CharacterEvent {
    id: string;
    type: CharacterEventType;
    source: EventSource;
    timestamp: number;
    /** For set/adjust. */
    path?: string;
    value?: PrimitiveValue;
    factor?: number;
    /** Batch of changes for set/adjust. */
    changes?: Record<string, PrimitiveValue>;
    /** Payload for non-set event types. */
    payload?: Record<string, unknown>;
    meta?: Record<string, unknown>;
}
export declare function createEvent(type: CharacterEventType, source: EventSource, partial?: Partial<CharacterEvent>): CharacterEvent;
/**
 * Applies a CharacterEvent to a HumanDefinition in a purely functional way:
 * returns the list of property ids that changed, or null for no-op types.
 * The definition must not be shared with the event log (caller clones).
 */
export declare function applyEventToDefinition(definition: HumanDefinition, event: CharacterEvent): number[] | null;
//# sourceMappingURL=character-event.d.ts.map