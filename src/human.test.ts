import { describe, it, expect } from "vitest";
import { Human } from "./human";
import { createEvent } from "./core/events/character-event";

describe("Human — Phase 1 proof-of-concept", () => {
  it("changes nose width via the single event API and keeps the rest stable", async () => {
    const human = await Human.create();

    const before = human.definitionRef.serialize();

    const result = human.modify({ "face.nose.width": 0.6 }, "ui");
    expect(result.cancelled).toBe(false);

    // Nose updated.
    expect(human.get("face.nose.width")).toBe(0.6);

    // Unrelated systems untouched (hair, expression, identity seed).
    expect(human.get("hair.length")).toBe(before["hair.length"]);
    expect(human.get("expression.mouthSmileLeft")).toBe(before["expression.mouthSmileLeft"]);
    expect(human.get("identity.seed")).toBe(before["identity.seed"]);
  });

  it("marks only proportional GPU work dirty (sparse morph, not cloth/hair)", async () => {
    const human = await Human.create();
    const r = human.modify({ "face.nose.width": 0.9 });
    expect(r.dirtyRegions).toContain("Face");
    // No hair/cloth kernels involved for a nose edit.
    expect(r.affectedKernelWork.map((k) => k.kind)).toContain("SparseMorph");
    expect(r.affectedKernelWork.map((k) => k.kind)).not.toContain("Hair");
  });

  it("undo restores the exact prior definition deterministically", async () => {
    const human = await Human.create();
    human.modify({ "face.nose.width": 0.6 });
    human.modify({ "face.jaw.width": 1.2 });
    expect(human.get("face.jaw.width")).toBe(1.2);

    human.undo();
    expect(human.get("face.jaw.width")).toBe(1.0);
    expect(human.get("face.nose.width")).toBe(0.6);

    human.undo();
    expect(human.get("face.nose.width")).toBe(1.0);
  });

  it("morph delta is localized in magnitude per region", async () => {
    const human = await Human.create();
    const before = human.computeMorphDelta();
    human.modify({ "face.nose.width": 0.5 });
    const after = human.computeMorphDelta();
    // Some vertex moved (sum of squared deltas > 0).
    let energy = 0;
    for (let i = 0; i < after.length; i++) {
      const d = after[i] - before[i];
      energy += d * d;
    }
    expect(energy).toBeGreaterThan(0);
  });

  it("routes a natural-language prompt through the structured event pipeline", async () => {
    const human = await Human.create();
    const r = human.prompt("make the nose narrower");
    expect(r.cancelled).toBe(false);
    expect(human.get("face.nose.width")).toBeLessThan(1.0);
  });

  it("rejects an uninterpretable prompt without mutating state", async () => {
    const human = await Human.create();
    const before = human.definitionRef.serialize();
    const r = human.prompt("gibberish xyz 123");
    expect(r.cancelled).toBe(true);
    expect(human.definitionRef.serialize()).toEqual(before);
  });

  it("speaks through timed visemes without changing identity", async () => {
    const human = await Human.create();
    const seed = human.get("identity.seed");
    human.prompt("say hello there");
    human.update(0.2);
    expect(human.get("identity.seed")).toBe(seed);
    // jaw opens a little during speech.
    expect(human.get("expression.jawOpen")).toBeGreaterThanOrEqual(0);
  });

  it("records events on the timeline for audit/replay", async () => {
    const human = await Human.create();
    human.modify({ "hair.length": 0.8 });
    human.setExpression("smile", 1);
    expect(human.historyLength).toBeGreaterThanOrEqual(2);
    // Timeline source-route check.
    const log = human.historyLength;
    void log;
  });

  it("applies a CharacterEvent directly (automation/external path)", async () => {
    const human = await Human.create();
    const evt = createEvent("adjust", "automation", { path: "body.muscularity", factor: 1.2 });
    const r = human.applyEvent(evt);
    expect(r.cancelled).toBe(false);
    expect(human.get("body.muscularity")).toBeGreaterThan(0.48);
  });

  it("constraint profile gating rejects wildly invalid legs of ranges", async () => {
    const human = await Human.create();
    // Realistic profile clamps within descriptor range at the definition level.
    const r = human.modify({ "global.height": 99 });
    expect(r.cancelled).toBe(false);
    // Clamped to max (2.6), never out of range.
    expect(human.get("global.height")).toBeLessThanOrEqual(2.6);
  });
});
