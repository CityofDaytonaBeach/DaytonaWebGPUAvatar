import { describe, expect, it } from 'vitest';
import { Human } from '../../human.js';
import { buildPhotorealMaterials, irisColorPreset, partMaterial } from './photoreal-material.js';
import { PHOTOREAL_FLAGS } from './constants.js';
import { luminance } from './color.js';

describe('photoreal material assignment', () => {
  it('produces one material per drawn part, skin first', async () => {
    const human = await Human.create();
    const canonical = human.canonicalRef;
    const materials = buildPhotorealMaterials(human.definition, canonical);
    expect(materials).toHaveLength(canonical.parts.length + 1);
    expect(materials[0].name).toBe('body');
    expect(materials[0].flags & PHOTOREAL_FLAGS.skin).toBeTruthy();
    expect(materials[0].flags & PHOTOREAL_FLAGS.normalPerturb).toBeTruthy();
    for (let i = 0; i < canonical.parts.length; i++) {
      expect(materials[i + 1].name).toBe(canonical.parts[i].name);
    }
  });

  it('gives every material finite, in-range shading parameters', async () => {
    const human = await Human.create();
    const materials = buildPhotorealMaterials(human.definition, human.canonicalRef);
    for (const m of materials) {
      for (const c of [...m.color, ...m.sssColor, ...m.material]) {
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      expect(Number.isFinite(m.ior)).toBe(true);
      expect(m.flags).toBeGreaterThanOrEqual(0);
    }
  });

  it('flags the cornea refractive with a human IOR and leaves it non-opaque', () => {
    const cornea = partMaterial('cornea_l', 'cornea', [0.2, 0.2, 0.2]);
    expect(cornea.flags & PHOTOREAL_FLAGS.refractive).toBeTruthy();
    expect(cornea.ior).toBeCloseTo(1.376, 6);
    expect(cornea.opaque).toBe(false);
  });

  it('flags iris and sclera separately and darkens the pupil', () => {
    const iris = partMaterial('iris_l', 'iris', irisColorPreset('blue'));
    const pupil = partMaterial('pupil_l', 'iris', irisColorPreset('blue'));
    const sclera = partMaterial('sclera_l', 'sclera', irisColorPreset('blue'));
    expect(iris.flags & PHOTOREAL_FLAGS.iris).toBeTruthy();
    expect(pupil.flags & PHOTOREAL_FLAGS.iris).toBeFalsy();
    expect(sclera.flags & PHOTOREAL_FLAGS.sclera).toBeTruthy();
    expect(luminance(pupil.color)).toBeLessThan(luminance(iris.color));
  });

  it('never paints the sclera pure white (it is translucent tissue)', () => {
    const sclera = partMaterial('sclera_l', 'sclera', [0.2, 0.2, 0.2]);
    expect(Math.max(...sclera.color)).toBeLessThan(0.95);
  });

  it('marks teeth as enamel with a dielectric IOR', () => {
    const teeth = partMaterial('teeth_upper', 'teeth', [0.2, 0.2, 0.2]);
    expect(teeth.flags & PHOTOREAL_FLAGS.enamel).toBeTruthy();
    expect(teeth.ior).toBeGreaterThan(1.5);
  });

  it('wet skin is smoother and more specular than dry skin', async () => {
    const human = await Human.create();
    human.modify({ 'skin.wetness': 0 });
    const dry = buildPhotorealMaterials(human.definition, human.canonicalRef)[0];
    human.modify({ 'skin.wetness': 1 });
    const wet = buildPhotorealMaterials(human.definition, human.canonicalRef)[0];
    expect(wet.material[0]).toBeLessThan(dry.material[0]);
    expect(wet.material[1]).toBeGreaterThan(dry.material[1]);
  });

  it('is deterministic for the same definition', async () => {
    const human = await Human.create();
    const a = buildPhotorealMaterials(human.definition, human.canonicalRef);
    const b = buildPhotorealMaterials(human.definition, human.canonicalRef);
    expect(a).toEqual(b);
  });
});
