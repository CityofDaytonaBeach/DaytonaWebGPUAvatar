import { describe, it, expect } from 'vitest';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { SparseMorphSet } from '../../geometry/morph/sparse-morph.js';
import { buildHdShapeSpace } from './hd-shape-builder.js';
import { CorrectiveShapeSolver } from './shape-corrective-solver.js';
import { DEFAULT_PROVIDER_BONE_NAMES } from '../../geometry/canonical/canonical-provider.js';

const BODY_BASES = [
  'ChestWidthBasis',
  'WaistBasis',
  'HipWidthBasis',
  'BodyFatBasis',
  'MuscleDefinitionBasis',
  'ShoulderWidthBasis',
  'SpineLengthBasis',
  'NeckLengthBasis',
  'ArmLengthBasis',
  'LegLengthBasis',
  'GlobalHeightBasis',
];

const BODY_CORRECTIVE = 'MuscularBroadShouldersCorrective';

function blockHuman(): CanonicalHuman {
  return new CanonicalHuman([...DEFAULT_PROVIDER_BONE_NAMES]);
}

describe('HD Body shape bases (HD BODY V0.1)', () => {
  it('registers every body identity control as a shape basis', () => {
    const { space, spec } = buildHdShapeSpace(blockHuman());
    for (const name of BODY_BASES) {
      const basis = space.bases.getByName(name);
      expect(basis, `missing basis ${name}`).toBeDefined();
      expect(basis!.deltas.length).toBeGreaterThan(0);
    }
  });

  it('registers the muscular x broad-shoulders combination corrective', () => {
    const { space, spec } = buildHdShapeSpace(blockHuman());
    const corrective = space.bases.getByName(BODY_CORRECTIVE);
    expect(corrective).toBeDefined();
    expect(spec.correctiveRules.length).toBeGreaterThan(0);
    const rule = spec.correctiveRules.find((r) => r.outputBasisId === corrective!.id);
    expect(rule).toBeDefined();
    expect(rule!.inputs).toHaveLength(2);
    expect(spec.correctiveMorphs.some((m) => m.name === `shape_${BODY_CORRECTIVE}`)).toBe(true);
  });

  it('evaluates the waist basis within the block-human torso fallback', () => {
    const c = blockHuman();
    const { space } = buildHdShapeSpace(c);
    const torso = c.regionRanges.get('torso')!;
    expect(torso).toBeDefined();
    const basis = space.bases.getByName('WaistBasis')!;
    const delta = space.evaluate(new Map([[basis.id, 1.0]]));
    let touched = 0;
    for (let i = 0; i < c.vertexCount; i++) {
      const d =
        Math.abs(delta[i * 3]) + Math.abs(delta[i * 3 + 1]) + Math.abs(delta[i * 3 + 2]);
      if (d > 0) {
        touched++;
        expect(i).toBeGreaterThanOrEqual(torso.start);
        expect(i).toBeLessThan(torso.start + torso.count);
      }
    }
    expect(touched).toBeGreaterThan(0);
  });

  it('evaluates global height across the full figure (not just one region)', () => {
    const c = blockHuman();
    const { space } = buildHdShapeSpace(c);
    const basis = space.bases.getByName('GlobalHeightBasis')!;
    const regions = new Set<string>();
    const delta = space.evaluate(new Map([[basis.id, 0.5]]));
    for (let i = 0; i < c.vertexCount; i++) {
      if (Math.abs(delta[i * 3 + 1]) > 0) {
        regions.add(c.vertices[i].region);
      }
    }
    // Height must span multiple regions (torso + at least one limb segment).
    expect(regions.size).toBeGreaterThanOrEqual(2);
    expect(regions.has('torso')).toBe(true);
  });

  it('corrective activation is the product of the two body inputs', () => {
    const c = blockHuman();
    const { space, spec } = buildHdShapeSpace(c);
    const solver = new CorrectiveShapeSolver(space, spec.correctiveRules);
    const muscle = space.bases.getByName('MuscleDefinitionBasis')!.id;
    const shoulder = space.bases.getByName('ShoulderWidthBasis')!.id;
    const corrective = space.bases.getByName(BODY_CORRECTIVE)!.id;
    const rule = solver['rules'].find((r) => r.outputBasisId === corrective)!;
    // Both active => nonzero product; only one active => gate closed (0).
    const both = new Map([
      [muscle, 0.5],
      [shoulder, 0.5],
    ]);
    expect(solver.activation(rule, both)).toBeCloseTo(0.25, 5);
    expect(solver.activation(rule, new Map([[muscle, 0.5]]))).toBeCloseTo(0, 5);
  });

  it('compiles body bases into the existing sparse morph set', () => {
    const c = blockHuman();
    const { space } = buildHdShapeSpace(c);
    const sink = new SparseMorphSet(c);
    space.compileToSparseMorphs(sink);
    expect(sink.get('shape_WaistBasis')).toBeDefined();
    expect(sink.get('shape_ShoulderWidthBasis')).toBeDefined();
    expect(sink.get('shape_GlobalHeightBasis')).toBeDefined();
    expect(sink.get(`shape_${BODY_CORRECTIVE}`)).toBeDefined();
  });
});
