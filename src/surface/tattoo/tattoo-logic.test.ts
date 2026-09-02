import { describe, it, expect } from 'vitest';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import {
  TattooDecalExtended,
  applyOpacityMap,
  blendMultipleDecals,
  generateDecalNormalOverlay,
  accumulateNormalOverlays,
  bakeDecalToNewBuffer,
} from './tattoo-decal.js';

function decal(
  id: string,
  vertexId: number,
  over: Partial<TattooDecalExtended> = {},
): TattooDecalExtended {
  return {
    id,
    region: 'head',
    center: { x: 0, y: 1, z: 0 },
    radius: 0.5,
    blendMode: 'normal',
    opacity: 1,
    normalStrength: 0,
    samples: [
      {
        vertexId,
        region: 'head',
        uv: { u: 0.5, v: 0.5 },
        opacity: 0.8,
        radialT: 0.2,
        color: [0.5, 0.25, 0.1],
      },
    ],
    ...over,
  };
}

describe('applyOpacityMap', () => {
  it('replaces each sample opacity through the map, clamped to [0,1]', () => {
    const d = decal('a', 3);
    const out = applyOpacityMap(d, () => 1.7);
    expect(out.samples[0].opacity).toBe(1);
    expect(out.samples[0].uv).toEqual(d.samples[0].uv);
    expect(out.samples[0].color).toEqual([0.5, 0.25, 0.1]);
  });

  it('passes uv and radialT to the map', () => {
    const d = decal('a', 3);
    let seen: number[] = [];
    applyOpacityMap(d, (u, v, r) => {
      seen = [u, v, r];
      return 0.4;
    });
    expect(seen).toEqual([0.5, 0.5, 0.2]);
  });

  it('returns a new decal without mutating the source', () => {
    const d = decal('a', 3);
    const out = applyOpacityMap(d, () => 0);
    expect(out).not.toBe(d);
    expect(d.samples[0].opacity).toBe(0.8);
  });
});

describe('bakeDecalToNewBuffer / blendMultipleDecals', () => {
  it('normal blend layers an opaque color proportionally', () => {
    const d = decal('a', 0, { opacity: 0.5 });
    const baked = bakeDecalToNewBuffer(d, 2);
    expect(baked.vertexCount).toBe(2);
    // normal: out = base*(1-a) + src*a, base=0, a=opacity*0.8=0.4
    expect(baked.colors[0]).toBeCloseTo(0.5 * 0.4, 5);
    expect(baked.colors[1]).toBeCloseTo(0.25 * 0.4, 5);
    expect(baked.mask[0]).toBe(1);
    expect(baked.mask[1]).toBe(0);
    expect(baked.colors[3]).toBe(0); // vertex 1 untouched
  });

  it('accumulates multiple decals in order onto the same vertices', () => {
    const a = decal('a', 0, { opacity: 1, samples: [{ ...decal('x', 0).samples[0], opacity: 1 }] });
    const b = decal('b', 0, {
      samples: [
        {
          vertexId: 0,
          region: 'head',
          uv: { u: 0.5, v: 0.5 },
          opacity: 1,
          radialT: 0.1,
          color: [0.5, 0.5, 0.5],
        },
      ],
    });
    const baked = blendMultipleDecals([a, b], 2);
    // b fully replaces a (both opaque) on the shared vertex.
    expect(baked.colors[0]).toBeCloseTo(0.5, 5);
    expect(baked.colors[1]).toBeCloseTo(0.5, 5);
    expect(baked.mask[0]).toBe(1);
  });
});

describe('normal overlay generation', () => {
  it('generateDecalNormalOverlay scales normals by opacity * strength', () => {
    const canonical = new CanonicalHuman(['root', 'head']);
    const base = canonical.vertices[1].normal;
    const d = decal('a', 1, {
      normalStrength: 2,
      samples: [{ ...decal('x', 1).samples[0], opacity: 0.5 }],
    });
    const overlay = generateDecalNormalOverlay(d, canonical);
    const s = 0.5 * 2;
    expect(overlay.strengths[1]).toBeCloseTo(s, 5);
    expect(overlay.strengths[0]).toBe(0);
    expect(overlay.normals[3]).toBeCloseTo(base.x * s, 5);
    expect(overlay.normals[4]).toBeCloseTo(base.y * s, 5);
  });

  it('accumulateNormalOverlays sums strengths across decals', () => {
    const canonical = new CanonicalHuman(['root', 'head']);
    const a = { ...decal('a', 0), normalStrength: 1, opacity: 0.5 };
    const b = { ...decal('b', 0), normalStrength: 2, opacity: 1 };
    const overlay = accumulateNormalOverlays([a, b], canonical);
    // sample.opacity defaults to 0.8 in the helper.
    expect(overlay.strengths[0]).toBeCloseTo(0.8 * 1 * 0.5 + 0.8 * 2 * 1, 5);
    expect(overlay.normals.length).toBe(canonical.vertices.length * 3);
  });
});
