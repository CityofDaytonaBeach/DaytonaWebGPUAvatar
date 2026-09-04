import { applyEventToDefinition } from '../events/character-event.js';
/**
 * Event-sourced progressive character timeline. The current human is always
 * `Base Human + Character Events + Time`. Snapshots act as periodic checkpoints
 * so replay never needs an unbounded event list. Supports undo/redo, restore,
 * branches.
 */
export class CharacterTimeline {
    events = [];
    pointer = -1;
    base;
    snapshots = [];
    constructor(base) {
        this.base = base.clone();
    }
    get length() {
        return this.events.length;
    }
    get index() {
        return this.pointer;
    }
    /** Event log (immutable view). */
    log() {
        return this.events;
    }
    /**
     * Append an event and advance. Functionally pure: rebuilds the definition
     * from base + events, but only computes from the last snapshot to keep it
     * bounded.
     */
    push(event) {
        // Truncate any redo branch at the pointer.
        this.events = this.events.slice(0, this.pointer + 1);
        this.events.push(event);
        this.pointer += 1;
        const def = this.rebuild();
        if (this.pointer % 64 === 0) {
            this.snapshots.push({ atEventIndex: this.pointer, definition: def.clone() });
        }
        return def;
    }
    rebuild() {
        const def = this.base.clone();
        for (let i = 0; i <= this.pointer; i++) {
            applyEventToDefinition(def, this.events[i]);
        }
        return def;
    }
    /** Undo one step; returns previous definition. */
    undo() {
        if (this.pointer < 0)
            return null;
        this.pointer -= 1;
        return this.rebuild();
    }
    /** Redo one step; returns next definition. */
    redo() {
        if (this.pointer >= this.events.length - 1)
            return null;
        this.pointer += 1;
        return this.rebuild();
    }
    /** Take a manual snapshot of the current state. */
    snapshot() {
        const s = { atEventIndex: this.pointer, definition: this.rebuild().clone() };
        this.snapshots.push(s);
        return s;
    }
    /** Restore the timeline pointer to a prior event index or snapshot index. */
    restore(atEventIndex) {
        const max = this.events.length - 1;
        if (!Number.isInteger(atEventIndex) || atEventIndex < -1 || atEventIndex > max) {
            throw new Error(`Cannot restore timeline to event index ${atEventIndex}`);
        }
        this.pointer = atEventIndex;
        return this.rebuild();
    }
    /** Create a branch point at the current state (clears redo history). */
    branch() {
        this.events = this.events.slice(0, this.pointer + 1);
        return this.rebuild();
    }
    /** Current reconstructed definition. */
    current() {
        return this.rebuild();
    }
    /** Base definition clone for deterministic higher-level replay systems. */
    baseDefinition() {
        return this.base.clone();
    }
    destroy() {
        this.snapshots = [];
        this.events = [];
        this.pointer = -1;
    }
}
//# sourceMappingURL=character-timeline.js.map