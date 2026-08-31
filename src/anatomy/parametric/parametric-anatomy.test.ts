import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../../core/schema/descriptors";
import { HumanDefinition } from "../../core/schema/human-definition";
import {
  resolveAnatomy,
  validateAnatomy,
  anatomySatisfaction,
} from "./parametric-anatomy";
import { placeSkeletonFromDefinition } from "../skeleton/skeleton";

function makeDef(seed?: Record<string, number>): HumanDefinition {
  return new HumanDefinition(createDefaultRegistry(), seed);
}

describe("parametric anatomy solver", () => {
  it("resolves deterministic neutral dimensions for a default human", () => {
    const d = resolveAnatomy(makeDef());
    expect(d.height).toBeCloseTo(1.78, 2);
    expect(d.scale).toBe(1);
    // Trunk order must be monotonic: pelvis < chest < shoulder.
    expect(d.hipHeight).toBeLessThan(d.chestY);
    expect(d.chestY).toBeLessThan(d.shoulderHeight);
    expect(d.shoulderHalfWidth).toBeGreaterThan(d.chestHalfWidth);
    expect(d.forearmLength).toBeGreaterThan(0);
    expect(d.shinLength).toBeGreaterThan(0);
  });

  it("is purely functional: same definition -> same dimensions", () => {
    const def = makeDef({ "global.height": 1.9, "body.bodyFat": 0.35 });
    expect(resolveAnatomy(def)).toEqual(resolveAnatomy(def));
  });

  it("grows with height and muscularity", () => {
    const short = resolveAnatomy(makeDef({ "global.height": 1.5 }));
    const tall = resolveAnatomy(makeDef({ "global.height": 2.1 }));
    expect(tall.hipHeight).toBeGreaterThan(short.hipHeight);
    expect(tall.shoulderHeight).toBeGreaterThan(short.shoulderHeight);

    const lean = resolveAnatomy(makeDef({ "body.bodyFat": 0.05 }));
    const heavy = resolveAnatomy(makeDef({ "body.bodyFat": 0.5 }));
    expect(heavy.waistHalfWidth).toBeGreaterThan(lean.waistHalfWidth);
    expect(heavy.chestHalfWidth).toBeGreaterThan(lean.chestHalfWidth);
  });

  it("constraint solver flags an implausible waist", () => {
    const d = resolveAnatomy(makeDef({ "body.waist": 1.8, "body.chest": 0.6, "body.bodyFat": 0.6 }));
    const msgs = validateAnatomy(d).map((c) => c.message);
    expect(msgs).toContain("waist exceeds chest");
    expect(anatomySatisfaction(validateAnatomy(d))).toBeLessThan(1);
  });

  it("places a skeleton that matches resolved anatomy heights", () => {
    const d = resolveAnatomy(makeDef({ "global.height": 1.9, "skeleton.shoulderWidth": 1.2 }));
    const bones = placeSkeletonFromDefinition(d);
    const pelvis = bones.find((b) => b.name === "pelvis")!.localPosition;
    const chest = bones.find((b) => b.name === "chest")!.localPosition;
    expect(pelvis.y).toBeCloseTo(d.hipHeight, 2);
    expect(chest.y).toBeGreaterThan(0);
    expect(bones.length).toBe(21);
    // Shoulders widen with shoulderWidth.
    const cv = bones.find((b) => b.name === "clavicle_r")!.localPosition;
    expect(cv.x).toBeCloseTo(d.shoulderHalfWidth * 0.92, 2);
  });

  it("joints widen in both x directions about the spine", () => {
    const d = resolveAnatomy(makeDef({ "skeleton.shoulderWidth": 1.3 }));
    const l = placeSkeletonFromDefinition(d).find((b) => b.name === "clavicle_l")!.localPosition;
    const r = placeSkeletonFromDefinition(d).find((b) => b.name === "clavicle_r")!.localPosition;
    expect(l.x).toBeLessThan(0);
    expect(r.x).toBeGreaterThan(0);
  });
});
