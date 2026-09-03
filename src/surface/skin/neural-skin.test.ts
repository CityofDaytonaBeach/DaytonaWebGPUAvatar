import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../core/schema/descriptors';
import { HumanDefinition } from '../../core/schema/human-definition';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human';
import { Human } from '../../human';
import {
  applySkinResidualColor,
  generateSkinResiduals,
  generateNormalPerturbation,
  computeAgingState,
  exportSkinMaterial,
} from './neural-skin';

describe('neural skin residual prototype', () => {
  it('generates deterministic bounded residual samples', () => {
    const registry = createDefaultRegistry();
    const definition = new HumanDefinition(registry, { 'skin.age': 55, 'skin.pigmentation': 0.7 });
    const canonical = new CanonicalHuman(['root', 'head']);

    const a = generateSkinResiduals(definition, canonical, { maxSamples: 24, strength: 0.8 });
    const b = generateSkinResiduals(definition, canonical, { maxSamples: 24, strength: 0.8 });

    expect(a).toEqual(b);
    expect(a.samples).toHaveLength(24);
    for (const sample of a.samples) {
      expect(sample.normalIntensity).toBeGreaterThanOrEqual(0);
      expect(sample.normalIntensity).toBeLessThanOrEqual(1);
      for (const delta of sample.colorDelta) {
        expect(delta).toBeGreaterThanOrEqual(-0.12);
        expect(delta).toBeLessThanOrEqual(0.12);
      }
    }
  });

  it('does not emit skin residuals for eye, teeth, tongue, or mouth-cavity parts', () => {
    const registry = createDefaultRegistry();
    const definition = new HumanDefinition(registry);
    const canonical = new CanonicalHuman(['root', 'head']);

    const field = generateSkinResiduals(definition, canonical);
    const regions = new Set(field.samples.map((s) => s.region));

    expect(regions.has('eye_sclera')).toBe(false);
    expect(regions.has('eye_iris')).toBe(false);
    expect(regions.has('teeth')).toBe(false);
    expect(regions.has('tongue')).toBe(false);
    expect(regions.has('mouth_cavity')).toBe(false);
  });

  it('applies residual color deltas with clamping', () => {
    const color = applySkinResidualColor([0.98, 0.02, 0.5], {
      vertexId: 1,
      region: 'face',
      colorDelta: [0.1, -0.1, 0.05],
      roughnessDelta: 0,
      normalIntensity: 0,
    });

    expect(color).toEqual([1, 0, 0.55]);
  });

  it('is exposed through Human and responds to skin parameters without topology edits', async () => {
    const human = await Human.create();
    const before = human.canonicalRef.vertexCount;
    const young = human.skinResiduals({ maxSamples: 12 });
    human.modify({ 'skin.age': 80, 'skin.wetness': 1 });
    const aged = human.skinResiduals({ maxSamples: 12 });

    expect(aged.samples).toHaveLength(12);
    expect(aged).not.toEqual(young);
    expect(human.canonicalRef.vertexCount).toBe(before);
  });

  it('generates bounded unit-length-normal perturbation (normal map proxy)', () => {
    const registry = createDefaultRegistry();
    const definition = new HumanDefinition(registry, { 'skin.age': 50 });
    const aging = computeAgingState(definition);
    const [x0, y0] = generateNormalPerturbation(3, { u: 0.2, v: 0.7 }, 'face', aging, 0.5, 0.3);
    const [x1, y1] = generateNormalPerturbation(3, { u: 0.2, v: 0.7 }, 'face', aging, 0.5, 0.3);
    expect(x0).toEqual(x1);
    expect(y0).toEqual(y1);
    expect(x0).toBeGreaterThanOrEqual(-0.35);
    expect(x0).toBeLessThanOrEqual(0.35);
    expect(x0 * x0 + y0 * y0).toBeLessThan(1);
  });

  it('adds bounded per-vertex normal perturbation to the GPU skin export', () => {
    const registry = createDefaultRegistry();
    const definition = new HumanDefinition(registry, { 'skin.age': 40 });
    const canonical = new CanonicalHuman(['root', 'head']);
    const material = exportSkinMaterial(definition, canonical);
    expect(material.normalPerturbX.length).toBe(canonical.vertexCount);
    expect(material.normalPerturbY.length).toBe(canonical.vertexCount);
    let sawNonZero = false;
    for (let i = 0; i < canonical.vertexCount; i++) {
      expect(material.normalPerturbX[i]).toBeGreaterThanOrEqual(-0.35);
      expect(material.normalPerturbX[i]).toBeLessThanOrEqual(0.35);
      expect(material.normalPerturbY[i]).toBeGreaterThanOrEqual(-0.35);
      expect(material.normalPerturbY[i]).toBeLessThanOrEqual(0.35);
      if (material.normalPerturbX[i] !== 0 || material.normalPerturbY[i] !== 0) sawNonZero = true;
    }
    expect(sawNonZero).toBe(true);
  });
});
