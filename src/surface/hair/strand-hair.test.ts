import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "../../core/schema/descriptors";
import { HumanDefinition } from "../../core/schema/human-definition";
import { CanonicalHuman } from "../../geometry/canonical/canonical-human";
import { Human } from "../../human";
import { countHairVertices, generateStrandHair } from "./strand-hair";

const bones = ["root", "head"];

describe("strand hair prototype", () => {
  it("generates deterministic strand geometry from HDL hair parameters", () => {
    const registry = createDefaultRegistry();
    const definition = new HumanDefinition(registry, {
      "hair.length": 0.7,
      "hair.density": 0.5,
      "hair.curl": 0.4,
    });
    const canonical = new CanonicalHuman(bones);

    const a = generateStrandHair(definition, canonical, { maxStrands: 20, segments: 4 });
    const b = generateStrandHair(definition, canonical, { maxStrands: 20, segments: 4 });

    expect(a).toEqual(b);
    expect(a.strands).toHaveLength(10);
    expect(countHairVertices(a)).toBe(50);
  });

  it("responds to density, length, curl, and gray parameters", () => {
    const registry = createDefaultRegistry();
    const short = new HumanDefinition(registry, { "hair.length": 0.2, "hair.density": 0.25, "hair.curl": 0.0 });
    const long = new HumanDefinition(registry, { "hair.length": 0.9, "hair.density": 1.0, "hair.curl": 1.0, "hair.gray": 1.0 });
    const canonical = new CanonicalHuman(bones);

    const shortHair = generateStrandHair(short, canonical, { maxStrands: 16, segments: 3 });
    const longHair = generateStrandHair(long, canonical, { maxStrands: 16, segments: 3 });
    const shortEnd = shortHair.strands[0].points.at(-1)!.position;
    const longEnd = longHair.strands[0].points.at(-1)!.position;
    const shortRoot = shortHair.strands[0].points[0].position;
    const longRoot = longHair.strands[0].points[0].position;

    expect(shortHair.strands.length).toBeLessThan(longHair.strands.length);
    expect(shortRoot.y - shortEnd.y).toBeLessThan(longRoot.y - longEnd.y);
    expect(longHair.strands.some((s) => s.points.at(-1)!.position.x !== s.points[0].position.x)).toBe(true);
    expect(longHair.color).toEqual([0.62, 0.62, 0.62]);
  });

  it("is exposed through Human without mutating the canonical mesh", async () => {
    const human = await Human.create();
    const before = human.canonicalRef.vertexCount;
    human.modify({ "hair.length": 0.85, "hair.density": 0.75, "hair.curl": 0.6 });

    const hair = human.hairGeometry({ maxStrands: 32, segments: 5 });

    expect(hair.strands.length).toBeGreaterThan(0);
    expect(human.canonicalRef.vertexCount).toBe(before);
    expect(human.computeMorphDelta()).toEqual(new Float32Array(before * 3));
  });
});
