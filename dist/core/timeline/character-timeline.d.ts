import { CharacterEvent } from '../events/character-event.js';
import { HumanDefinition } from '../schema/human-definition.js';
export interface Snapshot {
    atEventIndex: number;
    definition: HumanDefinition;
}
/**
 * Event-sourced progressive character timeline. The current human is always
 * `Base Human + Character Events + Time`. Snapshots act as periodic checkpoints
 * so replay never needs an unbounded event list. Supports undo/redo, restore,
 * branches.
 */
export declare class CharacterTimeline {
    private events;
    private pointer;
    private base;
    private snapshots;
    constructor(base: HumanDefinition);
    get length(): number;
    get index(): number;
    /** Event log (immutable view). */
    log(): ReadonlyArray<CharacterEvent>;
    /**
     * Append an event and advance. Functionally pure: rebuilds the definition
     * from base + events, but only computes from the last snapshot to keep it
     * bounded.
     */
    push(event: CharacterEvent): HumanDefinition;
    private rebuild;
    /** Undo one step; returns previous definition. */
    undo(): HumanDefinition | null;
    /** Redo one step; returns next definition. */
    redo(): HumanDefinition | null;
    /** Take a manual snapshot of the current state. */
    snapshot(): Snapshot;
    /** Restore the timeline pointer to a prior event index or snapshot index. */
    restore(atEventIndex: number): HumanDefinition;
    /** Create a branch point at the current state (clears redo history). */
    branch(): HumanDefinition;
    /** Current reconstructed definition. */
    current(): HumanDefinition;
    /** Base definition clone for deterministic higher-level replay systems. */
    baseDefinition(): HumanDefinition;
    destroy(): void;
}
//# sourceMappingURL=character-timeline.d.ts.map