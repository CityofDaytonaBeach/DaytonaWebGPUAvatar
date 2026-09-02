import { describe, it, expect } from 'vitest';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { SparseMorphSet } from '../../geometry/morph/sparse-morph.js';
import { createDefaultRegistry } from '../../core/schema/descriptors.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { HumanShapeSpace } from './human-shape-space.js';
import { ShapeCoefficientSolver } from './shape-coefficient-solver.js';
import { CorrectiveShapeSolver } from './shape-corrective-solver.js';

const BONES = ['root', 'head', 'neck'];
const registry = createDefaultRegistry();

function canonical(): CanonicalHuman {
  return new CanonicalHuman(BONES);
}

describe('ShapeBasisRegistry / HumanShapeSpace registration', () => {
  it('registers a region basis and keeps deltas within the region range', () => {
    const c = canonical();
    const space = new HumanShapeSpace(c);
    const noseRange = c.regionRanges.get('nose')!;
    const basis = space.addRegionBasis('NoseWidthBasis', 'face.nose.width', 'nose', (vx) => ({
      dx: Math.sign(vx) * 0.02,
      dy: 0,
      dz: 0,
    }));
    expect(space.bases.size).toBe(1);
    expect(basis.name).toBe('NoseWidthBasis');
    expect(basis.property).toBe('face.nose.width');
    expect(basis.deltas.length).toBeGreaterThan(0);
    for (const d of basis.deltas) {
      expect(d.vertexId).toBeGreaterThanOrEqual(noseRange.start);
      expect(d.vertexId).toBeLessThan(noseRange.start + noseRange.count);
    }
  });

  it('rejects duplicate basis names', () => {
    const space = new HumanShapeSpace(canonical());
    space.addRegionBasis('A', 'face.nose.width', 'nose', () => ({ dx: 0, dy: 0.01, dz: 0 }));
    expect(() =>
      space.addRegionBasis('A', 'face.nose.length', 'nose', () => ({ dx: 0, dy: 0.01, dz: 0 })),
    ).toThrow(/already registered/);
  });

  it('addVertexBasis uses only the requested ids', () => {
    const c = canonical();
    const space = new HumanShapeSpace(c);
    const ids = [0, 2, 4];
    const basis = space.addVertexBasis('Eyes', 'face.eye.spacing', ids, (vx) => ({
      dx: Math.sign(vx) * 0.03,
      dy: 0,
      dz: 0,
    }));
    expect(basis.deltas.map((d) => d.vertexId).sort((a, b) => a - b)).toEqual(ids);
  });
});

describe('ShapeCoefficientSolver', () => {
  it('returns ~0 coefficient for a property at its default (identity)', () => {
    const solver = new ShapeCoefficientSolver(registry);
    expect(solver.weightForProperty('face.nose.width', 1.0)).toBeCloseTo(0, 5);
  });

  it('uses the ratio-about-neutral model for nonzero-default properties', () => {
    const solver = new ShapeCoefficientSolver(registry);
    expect(solver.weightForProperty('face.nose.width', 1.1)).toBeCloseTo(0.1, 5);
    expect(solver.weightForProperty('face.nose.width', 0.9)).toBeCloseTo(-0.1, 5);
  });

  it('solves coefficients for every registered basis from a definition', () => {
    const c = canonical();
    const space = new HumanShapeSpace(c);
    space.addRegionBasis('NoseWidthBasis', 'face.nose.width', 'nose', (vx) => ({
      dx: Math.sign(vx) * 0.02,
      dy: 0,
      dz: 0,
    }));
    space.addRegionBasis('JawWidthBasis', 'face.jaw.width', 'jaw', (vx) => ({
      dx: Math.sign(vx) * 0.04,
      dy: 0,
      dz: 0,
    }));
    const def = new HumanDefinition(registry);
    def.set('face.nose.width', 1.2);
    const solver = new ShapeCoefficientSolver(registry);
    const coeffs = solver.solve(def, space);
    expect(coeffs.size).toBe(2);
    expect(coeffs.get(space.bases.getByName('NoseWidthBasis')!.id)).toBeCloseTo(0.2, 5);
    expect(coeffs.get(space.bases.getByName('JawWidthBasis')!.id)).toBeCloseTo(0, 5);
  });
});

describe('HumanShapeSpace evaluation', () => {
  it('evaluates Pfinal = Pbase + Σ basis×coeff only on affected vertices', () => {
    const c = canonical();
    const space = new HumanShapeSpace(c);
    const noseRange = c.regionRanges.get('nose')!;
    space.addRegionBasis('NoseWidthBasis', 'face.nose.width', 'nose', (vx) => ({
      dx: Math.sign(vx) * 0.02,
      dy: 0,
      dz: 0,
    }));
    const coeffs = new Map<number, number>([[space.bases.getByName('NoseWidthBasis')!.id, 1.0]]);
    const delta = space.evaluate(coeffs);
    expect(delta.length).toBe(c.vertexCount * 3);
    // All nonzero deltas live in the nose region.
    for (let i = 0; i < c.vertexCount; i++) {
      const d0 = Math.abs(delta[i * 3]) + Math.abs(delta[i * 3 + 1]) + Math.abs(delta[i * 3 + 2]);
      if (d0 > 0) {
        expect(i).toBeGreaterThanOrEqual(noseRange.start);
        expect(i).toBeLessThan(noseRange.start + noseRange.count);
      }
    }
    expect(space.affectedVertexIds(coeffs).size).toBeGreaterThan(0);
  });

  it('compileToSparseMorphs feeds the existing sparse morph set', () => {
    const c = canonical();
    const space = new HumanShapeSpace(c);
    const basis = space.addRegionBasis('NoseWidthBasis', 'face.nose.width', 'nose', (vx) => ({
      dx: Math.sign(vx) * 0.02,
      dy: 0,
      dz: 0,
    }));
    const sink = new SparseMorphSet(c);
    space.compileToSparseMorphs(sink);
    const morph = sink.get('shape_NoseWidthBasis');
    expect(morph).toBeDefined();
    expect(morph!.deltas.length).toBe(basis.deltas.length);
    // CPU accumulation matches evaluate().
    const out = new Float32Array(c.vertexCount * 3);
    sink.applyMask('shape_NoseWidthBasis', 1.0, out);
    const expectDelta = space.evaluate(new Map([[basis.id, 1.0]]));
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(expectDelta[i], 5);
  });
});

describe('CorrectiveShapeSolver (correlated deformation)', () => {
  it('activation is the continuous product of shaped inputs', () => {
    const c = canonical();
    const space = new HumanShapeSpace(c);
    const jaw = space.addRegionBasis('JawWidthBasis', 'face.jaw.width', 'jaw', (vx) => ({
      dx: Math.sign(vx) * 0.04,
      dy: 0,
      dz: 0,
    }));
    const mouth = space.addRegionBasis('MouthWidthBasis', 'face.mouth.width', 'mouth', (vx) => ({
      dx: Math.sign(vx) * 0.02,
      dy: 0,
      dz: 0,
    }));
    space.addRegionBasis('WideJawWideMouth', 'face.mouth.width', 'mouth', (vx) => ({
      dx: Math.sign(vx) * 0.03,
      dy: 0,
      dz: 0,
    }));
    const solver = new CorrectiveShapeSolver(space, [
      {
        inputs: [{ basisId: jaw.id }, { basisId: mouth.id }],
        outputBasisId: space.bases.getByName('WideJawWideMouth')!.id,
      },
    ]);
    const both = new Map([
      [jaw.id, 0.5],
      [mouth.id, 0.5],
    ]);
    expect(solver.activation(solver['rules'][0], both)).toBeCloseTo(0.25, 5);
    // With only one input active, activation is 0 (hard gate via product).
    expect(solver.activation(solver['rules'][0], new Map([[jaw.id, 0.5]]))).toBeCloseTo(0, 5);
  });

  it('evaluate adds corrective deltas only when the rule is active', () => {
    const c = canonical();
    const space = new HumanShapeSpace(c);
    const jaw = space.addRegionBasis('JawWidthBasis', 'face.jaw.width', 'jaw', (vx) => ({
      dx: Math.sign(vx) * 0.04,
      dy: 0,
      dz: 0,
    }));
    const mouth = space.addRegionBasis('MouthWidthBasis', 'face.mouth.width', 'mouth', (vx) => ({
      dx: Math.sign(vx) * 0.02,
      dy: 0,
      dz: 0,
    }));
    const corrective = space.addRegionBasis(
      'WideJawWideMouth',
      'face.mouth.width',
      'mouth',
      (vx) => ({
        dx: Math.sign(vx) * 0.03,
        dy: 0,
        dz: 0,
      }),
    );
    const solver = new CorrectiveShapeSolver(space, [
      {
        inputs: [{ basisId: jaw.id }, { basisId: mouth.id }],
        outputBasisId: corrective.id,
      },
    ]);

    // Only jaw active => corrective inactive (product has a 0 factor).
    const base = space.evaluate(new Map([[jaw.id, 0.5]]));
    const corrected = new Float32Array(base.length);
    corrected.set(base);
    solver.evaluate(new Map([[jaw.id, 0.5]]), corrected);
    expect(Array.from(corrected)).toEqual(Array.from(base));

    // Both active => corrective contributes.
    const both = new Map([
      [jaw.id, 0.5],
      [mouth.id, 0.5],
    ]);
    const correctedBoth = new Float32Array(base.length);
    correctedBoth.set(space.evaluate(both));
    const before = Array.from(correctedBoth);
    solver.evaluate(both, correctedBoth);
    expect(Array.from(correctedBoth)).not.toEqual(before);
  });
});
