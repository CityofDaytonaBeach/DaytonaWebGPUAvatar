import { describe, expect, it } from "vitest";
import { Human } from "../../human";
import { createParameterTransition, sampleTransition } from "./parameter-transition";

describe("parameter transitions", () => {
  it("samples linear transitions deterministically", async () => {
    const human = await Human.create();
    const transition = createParameterTransition(human.definitionRef, {
      path: "body.muscularity",
      targetValue: 0.8,
      duration: 10,
    }, 2);

    expect(sampleTransition(transition, 2)).toBeCloseTo(human.get("body.muscularity"));
    expect(sampleTransition(transition, 7)).toBeCloseTo((human.get("body.muscularity") + 0.8) * 0.5);
    expect(sampleTransition(transition, 12)).toBeCloseTo(0.8);
  });

  it("advances active transitions through the central event path", async () => {
    const human = await Human.create();
    human.transition("body.muscularity", 0.8, 10);
    const result = human.advanceTime(5);

    expect(result.cancelled).toBe(false);
    expect(human.get("body.muscularity")).toBeCloseTo(0.64);
    expect(result.affectedKernelWork.length).toBeGreaterThan(0);
  });

  it("undo and redo reconstruct transition time deterministically", async () => {
    const human = await Human.create();
    const start = human.get("hair.length");
    human.transition("hair.length", 0.9, 4);
    human.advanceTime(2);
    expect(human.get("hair.length")).toBeCloseTo((start + 0.9) * 0.5);

    human.undo();
    expect(human.get("hair.length")).toBeCloseTo(start);

    human.redo();
    expect(human.get("hair.length")).toBeCloseTo((start + 0.9) * 0.5);
  });

  it("completed transitions clamp to the target and stop accumulating", async () => {
    const human = await Human.create();
    human.transition("hair.length", 0.9, 2, "ease");
    human.advanceTime(10);
    const done = human.get("hair.length");
    human.advanceTime(10);

    expect(done).toBeCloseTo(0.9);
    expect(human.get("hair.length")).toBeCloseTo(0.9);
  });

  it("supports relative transition events from prompt interpretation", async () => {
    const human = await Human.create();
    const start = human.get("skin.age");
    const result = human.prompt("age her fifteen years");

    expect(result.cancelled).toBe(false);
    human.advanceTime(15 * 365 * 24 * 60 * 60);
    expect(human.get("skin.age")).toBeCloseTo(start + 15);
  });
});
