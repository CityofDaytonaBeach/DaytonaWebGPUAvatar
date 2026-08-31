import { describe, it, expect } from "vitest";
import { PropertyRegistry, makePropertyId, propertyCategory } from "./registry";
import { PropertyCategory, PersistenceType, IdentityImportance } from "./property";
import { createDefaultRegistry, DEFAULT_PROPERTY_DESCRIPTORS } from "./descriptors";
import { HumanDefinition } from "./human-definition";

describe("PropertyRegistry", () => {
  it("assigns stable ids per category base", () => {
    const r = new PropertyRegistry();
    r.register(DEFAULT_PROPERTY_DESCRIPTORS);
    const nose = r.require("face.nose.width");
    const height = r.require("global.height");
    expect(propertyCategory(nose.id)).toBe(PropertyCategory.Face);
    expect(propertyCategory(height.id)).toBe(PropertyCategory.Global);
    expect(nose.id).toBeGreaterThanOrEqual(PropertyCategory.Face);
    expect(makePropertyId(PropertyCategory.Face, 0)).toBe(PropertyCategory.Face);
  });

  it("does not allow duplicate paths", () => {
    const r = new PropertyRegistry();
    r.register([{ path: "a.b", type: "f32", default: 1, category: PropertyCategory.Global, persistence: PersistenceType.Identity }]);
    expect(() =>
      r.register([{ path: "a.b", type: "f32", default: 1, category: PropertyCategory.Global, persistence: PersistenceType.Identity }])
    ).toThrow(/Duplicate/);
  });

  it("computes sequential gpu offsets with alignment", () => {
    const r = new PropertyRegistry();
    r.register(DEFAULT_PROPERTY_DESCRIPTORS);
    const metas = r.all();
    let cursor = 0;
    for (const m of metas) {
      expect(m.gpuByteOffset).toBe(cursor);
      cursor += m.type === "f64" ? 8 : 4;
    }
  });

  it("default registry has all core properties", () => {
    const r = createDefaultRegistry();
    expect(r.require("face.nose.width").default).toBe(1.0);
    expect(r.require("expression.mouthSmileLeft").persistence).toBe(PersistenceType.Performance);
  });
});

describe("HumanDefinition", () => {
  it("stores defaults and clamps to range", () => {
    const human = new HumanDefinition(createDefaultRegistry());
    expect(human.get("face.nose.width")).toBe(1.0);
    human.set("face.nose.width", 10.0);
    expect(human.get("face.nose.width")).toBe(1.6); // clamped at max
  });

  it("adjust multiplies non-destructively", () => {
    const human = new HumanDefinition(createDefaultRegistry());
    human.set("face.nose.width", 1.0);
    human.adjust("face.nose.width", 0.95);
    expect(human.get("face.nose.width")).toBe(0.95);
  });

  it("serializes all properties deterministically", () => {
    const d = new HumanDefinition(createDefaultRegistry());
    const a = JSON.stringify(d.serialize());
    const b = JSON.stringify(d.serialize());
    expect(a).toBe(b);
  });

  it("writes GPU buffer by offset", () => {
    const d = new HumanDefinition(createDefaultRegistry());
    const buf = new Float32Array(2048);
    d.writeToBuffer(buf);
    const noseOffset = createDefaultRegistry().require("face.nose.width").gpuByteOffset!;
    expect(buf[noseOffset / 4]).toBe(1.0);
  });
});
