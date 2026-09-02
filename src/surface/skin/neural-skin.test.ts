import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../core/schema/descriptors';
import { HumanDefinition } from '../../core/schema/human-definition';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human';
import { Human } from '../../human';
import { applySkinResidualColor, generateSkinResiduals } from './neural-skin';

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
});
