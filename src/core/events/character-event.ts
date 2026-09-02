import { HumanDefinition, PrimitiveValue } from '../schema/human-definition.js';

export type EventSource =
  'ai' | 'ui' | 'automation' | 'simulation' | 'external' | 'api' | 'developer';

export type CharacterEventType =
  | 'set'
  | 'adjust'
  | 'expression'
  | 'pose'
  | 'speak'
  | 'wear'
  | 'addTattoo'
  | 'removeAttachment'
  | 'transition'
  | 'advanceTime';

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

let eventCounter = 0;

export function createEvent(
  type: CharacterEventType,
  source: EventSource,
  partial: Partial<CharacterEvent> = {},
): CharacterEvent {
  eventCounter += 1;
  return {
    id: partial.id ?? `evt-${Date.now().toString(36)}-${eventCounter.toString(36)}`,
    type,
    source,
    timestamp: partial.timestamp ?? Date.now(),
    ...partial,
  };
}

/**
 * Applies a CharacterEvent to a HumanDefinition in a purely functional way:
 * returns the list of property ids that changed, or null for no-op types.
 * The definition must not be shared with the event log (caller clones).
 */
export function applyEventToDefinition(
  definition: HumanDefinition,
  event: CharacterEvent,
): number[] | null {
  switch (event.type) {
    case 'set':
    case 'adjust': {
      const changed: number[] = [];
      if (event.changes) {
        for (const [path, value] of Object.entries(event.changes)) {
          if (event.type === 'adjust') {
            definition.adjust(path, value);
          } else {
            definition.set(path, value);
          }
          changed.push(definition.registryRef.require(path).id);
        }
        return changed;
      }
      if (event.path !== undefined) {
        if (event.type === 'adjust') {
          if (event.factor !== undefined) definition.adjust(event.path, event.factor);
        } else if (event.value !== undefined) {
          definition.set(event.path, event.value);
        }
        return [definition.registryRef.require(event.path).id];
      }
      return null;
    }
    case 'expression':
    case 'pose':
    case 'wear':
    case 'addTattoo':
    case 'removeAttachment':
    case 'transition':
    case 'advanceTime':
      return null; // Timing/peripheral systems consume these separately.
    default:
      return null;
  }
}
