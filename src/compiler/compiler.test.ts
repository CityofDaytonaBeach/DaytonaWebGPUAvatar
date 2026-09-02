import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../core/schema/descriptors";
import { HumanDefinition } from "../core/schema/human-definition";
import { DependencyGraph } from "./dependency/dependency-graph";
import { affectedSystemsForChange } from "./dependency/affected-systems";
import { DeltaCompiler } from "./delta/delta-compiler";
import { CanonicalHuman } from "../geometry/canonical/canonical-human";
import { CharacterTimeline } from "../core/timeline/character-timeline";
import { createEvent } from "../core/events/character-event";
import { IdentitySolver } from "../identity/solver/identity-solver";

function makeHuman() {
  const registry = createDefaultRegistry();
  const definition = new HumanDefinition(registry);
  return { registry, definition };
}

describe("DependencyGraph", () => {
  it("marks only affected descendants dirty", () => {
    const { registry } = makeHuman();
    const graph = new DependencyGraph(registry);
    // shoulderWidth depends on height + muscularity; muscularity is identity.
    const affected = graph.affectedBy([registry.require("global.height").id]);
    expect(affected.has(registry.require("global.height").id)).toBe(true);
    // Descendants of height: skeleton lengths + shoulderWidth.
    expect(affected.has(registry.require("skeleton.shoulderWidth").id)).toBe(true);
    expect(affected.has(registry.require("skeleton.neckLength").id)).toBe(true);
    // Unrelated systems must NOT be impacted.
    expect(affected.has(registry.require("hair.length").id)).toBe(false);
    expect(affected.has(registry.require("expression.mouthSmileLeft").id)).toBe(false);
  });

  it("groups affected properties into semantic human systems", () => {
    const { registry } = makeHuman();
    const graph = new DependencyGraph(registry);
    const nose = affectedSystemsForChange(registry, graph, [registry.require("face.nose.width").id]);
    const hair = affectedSystemsForChange(registry, graph, [registry.require("hair.length").id]);
    const height = affectedSystemsForChange(registry, graph, [registry.require("global.height").id]);

    expect(nose.map((entry) => entry.system)).toEqual(["FaceGeometry"]);
    expect(hair.map((entry) => entry.system)).toEqual(["HairSystem"]);
    expect(height.map((entry) => entry.system)).toContain("Skeleton");
    expect(height.map((entry) => entry.system)).not.toContain("HairSystem");
  });
});

describe("DeltaCompiler", () => {
  it("maps face changes to sparse morph, not hair/cloth kernels", () => {
    const { registry } = makeHuman();
    const graph = new DependencyGraph(registry);
    const delta = new DeltaCompiler(registry, graph);
    const work = delta.compile([registry.require("face.nose.width").id]);
    const kinds = work.map((w) => w.kind);
    expect(kinds).toContain("SparseMorph");
    expect(kinds).not.toContain("Hair");
    expect(kinds).not.toContain("Cloth");
  });

  it("merges overlapping batches into unique work", () => {
    const { registry } = makeHuman();
    const graph = new DependencyGraph(registry);
    const delta = new DeltaCompiler(registry, graph);
    const merged = delta.compileBatch([
      [registry.require("face.nose.width").id],
      [registry.require("face.jaw.width").id],
    ]);
    // Merge duplicates: only one SparseMorph item.
    const sparse = merged.filter((w) => w.kind === "SparseMorph");
    expect(sparse.length).toBe(1);
  });

  it("assigns localized vertex ranges when canonical ranges are available", () => {
    const { registry } = makeHuman();
    const graph = new DependencyGraph(registry);
    const canonical = new CanonicalHuman(["root", "pelvis", "spine_01", "spine_02", "chest", "neck", "head", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "forearm_l", "forearm_r", "hand_l", "hand_r", "thigh_l", "thigh_r", "shin_l", "shin_r", "foot_l", "foot_r"]);
    const delta = new DeltaCompiler(registry, graph, canonical);
    const noseWork = delta.compile([registry.require("face.nose.width").id]).find((work) => work.kind === "SparseMorph")!;
    const bodyWork = delta.compile([registry.require("body.muscularity").id]).find((work) => work.kind === "SparseMorph")!;

    expect(noseWork.vertexRanges).toEqual([canonical.regionRanges.get("nose")]);
    expect(bodyWork.vertexRanges).toEqual([canonical.regionRanges.get("torso")]);
    expect(bodyWork.vertexRanges[0].count).toBeGreaterThanOrEqual(noseWork.vertexRanges[0].count);
  });
});

describe("Timeline + Identity", () => {
  it("undo restores exact previous state; identity stable", () => {
    const { registry, definition } = makeHuman();
    const timeline = new CharacterTimeline(definition);

    timeline.push(createEvent("set", "ui", { path: "face.nose.width", value: 0.6 }));
    const after = timeline.current();
    expect(after.get("face.nose.width")).toBe(0.6);

    // Verify expression/hair untouched by an identity-safe geometry change.
    expect(after.get("expression.mouthSmileLeft")).toBe(0.0);
    expect(after.get("hair.colorR")).toBe(0.12);

    const undone = timeline.undo();
    expect(undone!.get("face.nose.width")).toBe(1.0);

    const redone = timeline.redo();
    expect(redone!.get("face.nose.width")).toBe(0.6);
  });

  it("identity solver allows explicitly targeted structural edits", () => {
    const { registry } = makeHuman();
    const solver = new IdentitySolver(registry);
    const def = new HumanDefinition(registry);
    // Changing nose by name IS an explicit identity edit -> allowed.
    const gate = solver.gate(createEvent("set", "ui", { path: "face.nose.width", value: 0.5 }), def);
    expect(gate.allowed).toBe(true);
    // Expression is never identity-affecting.
    const exprGate = solver.gate(createEvent("set", "ui", { path: "expression.mouthSmileLeft", value: 1 }), def);
    expect(exprGate.allowed).toBe(true);
  });
});
