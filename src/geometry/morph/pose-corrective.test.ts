import { describe, it, expect } from 'vitest';
import { Human } from '../../human.js';
import { createDefaultRegistry } from '../../core/schema/descriptors.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { MorphDriver } from './morph-driver.js';
import { HDCanonicalHumanProvider } from '../canonical/hd-head-provider.js';
import { quatFromEulerDeg } from '../../animation/skeleton/skeletal-animation.js';

function sumAbs(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]);
  return s;
}

/** Build a standalone driver + definition for direct weight probing. */
function makeDriver() {
  const registry = createDefaultRegistry();
  const driver = new MorphDriver(registry);
  const definition = new HumanDefinition(registry);
  return { registry, driver, definition };
}

describe('pose/skeleton correctives (P15)', () => {
  it('bone-driven morph weight is neutral at rest and non-zero when the bone deflects', () => {
    const { driver, definition } = makeDriver();
    driver.registerBone('poseHeadTiltChin', 'head', 'z', 0, 30);
    const bones = [
      { name: 'head', parent: 'neck', localPosition: { x: 0, y: 0, z: 0 }, restRotation: { x: 0, y: 0, z: 0, w: 1 } },
    ];

    // No pose -> bone at rest -> coefficient 0.
    driver.setPose(bones, []);
    expect(driver.weight(definition, 'poseHeadTiltChin')).toBeCloseTo(0, 6);

    // Roll the head 15deg about z -> ~0.5 coefficient (signed).
    driver.setPose(bones, [
      { name: 'head', localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(0, 0, 15) },
    ]);
    expect(Math.abs(driver.weight(definition, 'poseHeadTiltChin') - 0.5)).toBeLessThan(0.05);
  });

  it('property x bone corrective needs BOTH the property and the deflection', () => {
    const { driver, definition } = makeDriver();
    driver.registerCorrective('poseJawTiltCorrective', [
      { property: 'expression.jawOpen' },
      { boneName: 'head', axis: 'x', neutralDeg: 0, spanDeg: 25 },
    ]);
    const bones = [{ name: 'head', parent: 'neck', localPosition: { x: 0, y: 0, z: 0 }, restRotation: { x: 0, y: 0, z: 0, w: 1 } }];

    // Jaw open but head rest -> product 0.
    definition.set('expression.jawOpen', 0.8);
    driver.setPose(bones, []);
    expect(driver.weight(definition, 'poseJawTiltCorrective')).toBeCloseTo(0, 6);

    // Head nod but jaw 0 -> product 0.
    definition.set('expression.jawOpen', 0);
    driver.setPose(bones, [
      { name: 'head', localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(15, 0, 0) },
    ]);
    expect(driver.weight(definition, 'poseJawTiltCorrective')).toBeCloseTo(0, 6);

    // Both -> product non-zero.
    definition.set('expression.jawOpen', 0.8);
    driver.setPose(bones, [
      { name: 'head', localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(15, 0, 0) },
    ]);
    expect(Math.abs(driver.weight(definition, 'poseJawTiltCorrective'))).toBeGreaterThan(0.05);
  });

  it('pose correctives move skin vertices through the CPU morph pipeline', async () => {
    const human = await Human.create({ canonicalProvider: new HDCanonicalHumanProvider() });
    const rest = human.computeMorphDelta();

    // Roll the head about z -> the headTilt chin corrective deflects lower-face
    // vertices, so the morph delta is non-zero purely from pose (P15).
    human.setPose([
      { name: 'head', localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(0, 0, 18) },
    ]);
    const posed = human.computeMorphDelta();
    expect(sumAbs(posed)).toBeGreaterThan(sumAbs(rest));
  });

  it('exposes which morphs are driven by a bone (morphUsesBone)', () => {
    const { driver } = makeDriver();
    driver.registerBone('poseHeadTiltChin', 'head', 'z', 0, 30);
    expect(driver.morphUsesBone('poseHeadTiltChin', 'head')).toBe(true);
    expect(driver.morphUsesBone('poseHeadTiltChin', 'neck')).toBe(false);
    expect(driver.morphUsesBone('noseWidth', 'head')).toBe(false);
  });
});