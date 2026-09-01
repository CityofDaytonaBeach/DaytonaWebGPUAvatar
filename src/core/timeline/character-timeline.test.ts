import { describe, expect, it } from "vitest";
import { createEvent } from "../events/character-event";
import { createDefaultRegistry } from "../schema/descriptors";
import { HumanDefinition } from "../schema/human-definition";
import { CharacterTimeline } from "./character-timeline";

describe("CharacterTimeline restore", () => {
  it("restores the pointer to a saved event index", () => {
    const base = new HumanDefinition(createDefaultRegistry());
    const timeline = new CharacterTimeline(base);

    timeline.push(createEvent("set", "ui", { changes: { "face.nose.width": 0.6 } }));
    const snapshot = timeline.snapshot();
    timeline.push(createEvent("set", "ui", { changes: { "face.jaw.width": 1.25 } }));

    const restored = timeline.restore(snapshot.atEventIndex);
    expect(restored.get("face.nose.width")).toBe(0.6);
    expect(restored.get("face.jaw.width")).toBe(1.0);
    expect(timeline.index).toBe(snapshot.atEventIndex);
  });

  it("rejects invalid restore indices", () => {
    const timeline = new CharacterTimeline(new HumanDefinition(createDefaultRegistry()));
    expect(() => timeline.restore(99)).toThrow(/Cannot restore timeline/);
  });
});
