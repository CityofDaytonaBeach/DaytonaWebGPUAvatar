import { describe, expect, it } from "vitest";
import { Human } from "../../human";

describe("internal anatomy view", () => {
  it("returns no internal primitives for normal rendering", async () => {
    const human = await Human.create();
    const view = human.internalAnatomy("normal");

    expect(view.showSkin).toBe(true);
    expect(view.skinOpacity).toBe(1);
    expect(view.primitives).toHaveLength(0);
  });

  it("builds skeleton display primitives from the parametric skeleton", async () => {
    const human = await Human.create();
    const skeleton = human.internalAnatomy("skeleton");

    expect(skeleton.showSkin).toBe(false);
    expect(skeleton.primitives.some((p) => p.kind === "joint" && p.name === "head.joint")).toBe(true);
    expect(skeleton.primitives.some((p) => p.kind === "bone" && p.name === "neck->head")).toBe(true);
    expect(skeleton.primitives.some((p) => p.kind === "muscle")).toBe(false);
  });

  it("builds muscle display primitives without skeleton bones in muscle mode", async () => {
    const human = await Human.create();
    const muscles = human.internalAnatomy("muscle");

    expect(muscles.primitives.some((p) => p.kind === "muscle" && p.name === "biceps_l")).toBe(true);
    expect(muscles.primitives.some((p) => p.kind === "bone")).toBe(false);
  });

  it("combines skeleton and muscles for anatomy mode", async () => {
    const human = await Human.create();
    const anatomy = human.internalAnatomy("anatomy");

    expect(anatomy.primitives.some((p) => p.kind === "bone")).toBe(true);
    expect(anatomy.primitives.some((p) => p.kind === "muscle")).toBe(true);
    expect(anatomy.showSkin).toBe(false);
  });

  it("supports transparent skin mode without mutating character state", async () => {
    const human = await Human.create();
    const before = human.get("body.muscularity");
    const view = human.internalAnatomy("transparentSkin");

    expect(view.showSkin).toBe(true);
    expect(view.skinOpacity).toBeGreaterThan(0);
    expect(view.skinOpacity).toBeLessThan(1);
    expect(view.primitives.some((p) => p.kind === "bone")).toBe(true);
    expect(human.get("body.muscularity")).toBe(before);
  });

  it("responds deterministically to anatomy changes", async () => {
    const human = await Human.create();
    const before = human.internalAnatomy("muscle").primitives.find((p) => p.name === "biceps_l");
    human.modify({ "body.chest": 1.2, "body.muscularity": 0.8 });
    const after = human.internalAnatomy("muscle").primitives.find((p) => p.name === "biceps_l");

    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after!.radius).toBeGreaterThan(before!.radius);
  });
});
