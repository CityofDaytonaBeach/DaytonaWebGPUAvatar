import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "../../core/schema/descriptors";
import { HumanDefinition } from "../../core/schema/human-definition";
import { resolveAnatomy } from "../../anatomy/parametric/parametric-anatomy";
import { Human } from "../../human";
import { generateGarment, generateGarments } from "./garment";

describe("wearable garment geometry prototype", () => {
  it("generates deterministic shirt geometry from a wearable attachment", () => {
    const dims = resolveAnatomy(new HumanDefinition(createDefaultRegistry()));
    const attachment = { id: "shirt", kind: "wearable" as const, anchor: { region: "torso" as const }, data: { color: [0.2, 0.4, 1.4] } };

    const a = generateGarment(attachment, dims);
    const b = generateGarment(attachment, dims);

    expect(a).toEqual(b);
    expect(a.kind).toBe("shirt");
    expect(a.vertices).toHaveLength(16);
    expect(Array.from(a.indices)).toHaveLength(24);
    expect(a.color).toEqual([0.2, 0.4, 1]);
  });

  it("generates sleeve geometry for arm-region wearables", () => {
    const dims = resolveAnatomy(new HumanDefinition(createDefaultRegistry()));
    const sleeve = generateGarment({ id: "sleeve", kind: "wearable", anchor: { region: "upperarm_l" } }, dims);

    expect(sleeve.kind).toBe("sleeve");
    expect(sleeve.vertices).toHaveLength(8);
    expect(sleeve.vertices.every((v) => v.position.x <= 0)).toBe(true);
  });

  it("filters non-wearable attachments when generating garments", () => {
    const dims = resolveAnatomy(new HumanDefinition(createDefaultRegistry()));
    const garments = generateGarments([
      { id: "shirt", kind: "wearable", anchor: { region: "torso" } },
      { id: "tattoo", kind: "tattoo", anchor: { region: "torso" } },
    ], dims);

    expect(garments.map((g) => g.id)).toEqual(["shirt"]);
  });

  it("responds to anatomy changes and remains separate from body topology", async () => {
    const lean = await Human.create();
    const large = await Human.create();
    lean.wear("shirt", { region: "torso" });
    large.wear("shirt", { region: "torso" });
    large.modify({ "body.waist": 1.8, "body.bodyFat": 0.6 });

    const leanGarment = lean.garments()[0];
    const largeGarment = large.garments()[0];
    const leanMaxX = Math.max(...leanGarment.vertices.map((v) => v.position.x));
    const largeMaxX = Math.max(...largeGarment.vertices.map((v) => v.position.x));

    expect(largeMaxX).toBeGreaterThan(leanMaxX);
    expect(large.canonicalRef.vertexCount).toBe(lean.canonicalRef.vertexCount);
  });
});
