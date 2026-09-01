import { describe, it, expect } from "vitest";
import { CanonicalHuman } from "./canonical-human";
import { CanonicalTopology } from "./canonical-topology";
import { adaptCanonicalTopologyAsset } from "./canonical-adapter";
import { validateCanonicalHuman } from "./canonical-validator";

const BONES = [
  "root", "pelvis", "spine_01", "spine_02", "chest", "neck", "head",
  "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "forearm_l", "forearm_r",
  "hand_l", "hand_r", "thigh_l", "thigh_r", "shin_l", "shin_r", "foot_l", "foot_r",
];

function snapshotOf(c: CanonicalHuman): CanonicalTopology {
  return {
    vertices: c.vertices.map((v) => ({
      id: v.id,
      position: v.position,
      normal: v.normal,
      uv: v.uv,
      region: v.region,
      weights: v.weights,
    })),
    indices: c.indices,
    parts: c.parts.map((p) => ({ ...p })),
  };
}

function vertex(id: number, region: CanonicalTopology["vertices"][number]["region"]): CanonicalTopology["vertices"][number] {
  return {
    id,
    position: { x: 0, y: id, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    uv: { u: 0.5, v: 0.5 },
    region,
    weights: { head: 1.0 },
  };
}

describe("canonical topology adapter", () => {
  it("adapts the block human snapshot into a validated canonical human", () => {
    const block = new CanonicalHuman(BONES);
    const result = adaptCanonicalTopologyAsset(snapshotOf(block), BONES);

    expect(result.ok).toBe(true);
    expect(result.report.issues).toEqual([]);
    expect(result.canonical!.vertexCount).toBe(block.vertexCount);
    expect(result.canonical!.triangleCount).toBe(block.triangleCount);
    expect(validateCanonicalHuman(result.canonical!).valid).toBe(true);
    expect(result.canonical!.partVertexRange("tongue")).toEqual(block.partVertexRange("tongue"));
  });

  it("rejects assets with overlapping part vertex ranges", () => {
    const asset: CanonicalTopology = {
      vertices: [vertex(0, "head"), vertex(1, "head"), vertex(2, "head"), vertex(3, "head")],
      indices: new Uint32Array([0, 0, 0, 1, 1, 1]),
      parts: [
        { name: "eye_l", kind: "sclera", region: "head", vertexStart: 0, vertexCount: 2, indexStart: 0, indexCount: 3 },
        { name: "eye_r", kind: "sclera", region: "head", vertexStart: 1, vertexCount: 2, indexStart: 3, indexCount: 3 },
      ],
    };

    const result = adaptCanonicalTopologyAsset(asset, BONES);

    expect(result.ok).toBe(false);
    expect(result.canonical).toBeNull();
    expect(result.report.issues.map((issue) => issue.code)).toContain("part-vertex-range-overlap");
  });

  it("rejects parts whose region does not cover their vertex range", () => {
    const asset: CanonicalTopology = {
      vertices: [vertex(0, "face"), vertex(1, "face")],
      indices: new Uint32Array([0, 0, 0]),
      parts: [{ name: "eye_l", kind: "sclera", region: "head", vertexStart: 0, vertexCount: 2, indexStart: 0, indexCount: 3 }],
    };

    const result = adaptCanonicalTopologyAsset(asset, BONES);

    expect(result.ok).toBe(false);
    expect(result.report.issues.map((issue) => issue.code)).toContain("part-region-mismatch");
  });

  it("reports archetype mismatch for non-topology assets", () => {
    const result = adaptCanonicalTopologyAsset({ hello: "world" } as unknown, BONES);

    expect(result.ok).toBe(false);
    expect(result.report.issues[0].code).toBe("archetype-mismatch");
  });

  it("writes adapted data through the canonical geometry accessors", () => {
    const block = new CanonicalHuman(BONES);
    const result = adaptCanonicalTopologyAsset(snapshotOf(block), BONES);

    const base = result.canonical!.baseGeometry();
    expect(base.positions).toHaveLength(block.vertexCount * 3);
    expect(base.normals).toHaveLength(block.vertexCount * 3);
  });
});