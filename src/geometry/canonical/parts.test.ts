import { describe, it, expect } from "vitest";
import { CanonicalHuman } from "./canonical-human";
import { Human } from "../../human";

const BONES = [
  "root", "pelvis", "spine_01", "spine_02", "chest", "neck", "head",
  "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "forearm_l", "forearm_r",
  "hand_l", "hand_r", "thigh_l", "thigh_r", "shin_l", "shin_r", "foot_l", "foot_r",
];

const EXPECTED_PARTS = [
  "eye_l", "eye_r", "iris_l", "iris_r", "pupil_l", "pupil_r",
  "teeth_upper", "teeth_lower", "tongue", "mouth_cavity",
];

describe("CanonicalHuman parts", () => {
  it("exposes the detail parts with non-overlapping stable vertex ranges", () => {
    const c = new CanonicalHuman(BONES);
    const names = c.parts.map((p) => p.name);
    expect(names.sort()).toEqual([...EXPECTED_PARTS].sort());

    // Verify part vertex ranges are non-overlapping and in-bounds.
    const ranges: Array<[number, number]> = c.parts.map((p) => [p.vertexStart, p.vertexStart + p.vertexCount]);
    for (let i = 0; i < ranges.length; i++) {
      const [s0, e0] = ranges[i];
      expect(s0).toBeGreaterThanOrEqual(0);
      expect(e0).toBeLessThanOrEqual(c.vertexCount);
      for (let j = i + 1; j < ranges.length; j++) {
        const [s1, e1] = ranges[j];
        expect(e0 <= s1 || e1 <= s0).toBe(true); // no overlap
      }
    }
  });

  it("registers per-region ranges for the new parts with surface UVs in [0,1]", () => {
    const c = new CanonicalHuman(BONES);
    for (const region of ["eye_sclera", "eye_iris", "teeth", "tongue", "mouth_cavity"] as const) {
      const range = c.regionRanges.get(region);
      expect(range).toBeDefined();
      expect(range!.count).toBeGreaterThan(0);
      for (let i = range!.start; i < range!.start + range!.count; i++) {
        const v = c.vertices[i];
        expect(v.uv.u).toBeGreaterThanOrEqual(0);
        expect(v.uv.u).toBeLessThanOrEqual(1);
        expect(v.uv.v).toBeGreaterThanOrEqual(0);
        expect(v.uv.v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps stable vertex ids unique and monotonic across body + parts", () => {
    const c = new CanonicalHuman(BONES);
    const ids = c.vertices.map((v) => v.id);
    expect(new Set(ids).size).toBe(c.vertices.length);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBe(ids[i - 1] + 1);
    }
  });

  it("computes the body index range as everything before the first detail part", () => {
    const c = new CanonicalHuman(BONES);
    const firstDetailStart = c.parts[0].indexStart;
    expect(firstDetailStart).toBeGreaterThan(0);
    expect(c.indices.length).toBeGreaterThan(firstDetailStart);
  });
});

describe("part-localized morphs", () => {
  it("jawOpen moves only tongue + mouth-cavity vertices", async () => {
    const human = await Human.create();
    const canonical = human.canonicalRef;
    human.modify({ "expression.jawOpen": 0.9 });
    const delta = human.computeMorphDelta();

    const tongueRange = canonical.regionRanges.get("tongue")!;
    const cavityRange = canonical.regionRanges.get("mouth_cavity")!;
    const affected = new Set<number>();
    for (let v = 0; v < canonical.vertexCount; v++) {
      const mag = Math.abs(delta[v * 3]) + Math.abs(delta[v * 3 + 1]) + Math.abs(delta[v * 3 + 2]);
      if (mag > 1e-6) affected.add(v);
    }
    expect(affected.size).toBeGreaterThan(0);
    for (const v of affected) {
      const inTongue = v >= tongueRange.start && v < tongueRange.start + tongueRange.count;
      const inCavity = v >= cavityRange.start && v < cavityRange.start + cavityRange.count;
      expect(inTongue || inCavity).toBe(true);
    }
  });

  it("eyeSpacing spreads only eye-related regions, never torso/hair", async () => {
    const human = await Human.create();
    const canonical = human.canonicalRef;
    human.modify({ "face.eyeSpacing": 1.25 });
    const delta = human.computeMorphDelta();

    const affected = new Set<number>();
    for (let v = 0; v < canonical.vertexCount; v++) {
      const mag = Math.abs(delta[v * 3]) + Math.abs(delta[v * 3 + 1]) + Math.abs(delta[v * 3 + 2]);
      if (mag > 1e-6) affected.add(v);
    }
    const allowedRegions = new Set(["eyes", "eye_sclera", "eye_iris"]);
    for (const v of affected) {
      expect(allowedRegions.has(canonical.vertices[v].region)).toBe(true);
    }
    // Torso must be untouched.
    const torsoRange = canonical.regionRanges.get("torso")!;
    for (let v = torsoRange.start; v < torsoRange.start + torsoRange.count; v++) {
      expect(affected.has(v)).toBe(false);
    }
  });

  it("height + waist body morphs move only body regions, never the face", async () => {
    const human = await Human.create();
    const canonical = human.canonicalRef;
    human.modify({ "global.height": 1.95, "body.waist": 1.4 });
    const delta = human.computeMorphDelta();

    const affected = new Set<number>();
    for (let v = 0; v < canonical.vertexCount; v++) {
      const mag = Math.abs(delta[v * 3]) + Math.abs(delta[v * 3 + 1]) + Math.abs(delta[v * 3 + 2]);
      if (mag > 1e-6) affected.add(v);
    }
    expect(affected.size).toBeGreaterThan(0);
    const faceRegions = new Set(["nose", "jaw", "eyes", "mouth"]);
    for (const v of affected) {
      expect(faceRegions.has(canonical.vertices[v].region)).toBe(false);
    }
  });
});

describe("part morph registration", () => {
  it("registers morphs addressing the new detailed parts", async () => {
    const human = await Human.create();
    const names = human.morphNames();
    expect(names).toContain("eyeSpacingSclera");
    expect(names).toContain("eyeSpacingIris");
    expect(names).toContain("jawOpen");
    expect(names).toContain("jawOpenCavity");
  });
});
