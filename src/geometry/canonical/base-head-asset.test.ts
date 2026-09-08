import { describe, it, expect } from 'vitest';
import {
  BaseHeadLicenseError,
  BaseHeadProvider,
  assetLicenseClass,
  computeAssetNormals,
  inspectBaseHeadAsset,
  isShippableLicense,
  type BaseHeadAsset,
} from './base-head-asset.js';

/** A tiny well-formed head patch positioned in the canonical head frame. */
function makeAsset(overrides: Partial<BaseHeadAsset> = {}): BaseHeadAsset {
  return {
    name: 'test neutral head',
    source: 'https://example.invalid/head',
    license: 'MIT',
    revision: '0.1',
    positions: new Float32Array([
      -0.03, 1.86, 0.09, 0.03, 1.86, 0.09, 0.0, 1.92, 0.085, 0.0, 1.8, 0.088,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 3, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0.5, 1, 0.5, 0]),
    landmarks: [
      { name: 'nasion', vertexIndex: 2 },
      { name: 'gnathion', vertexIndex: 3 },
    ],
    ...overrides,
  };
}

describe('license classification', () => {
  it('accepts only permissive licenses as shippable', () => {
    expect(assetLicenseClass('MIT')).toBe('shippable');
    expect(assetLicenseClass('apache-2.0')).toBe('shippable');
    expect(isShippableLicense('CC0-1.0')).toBe(true);
  });

  it('classifies public head-model research terms as research_only', () => {
    for (const id of [
      'flame-license',
      'smplx-license',
      'metha-research',
      'cc-by-nc-4.0',
      'non-commercial',
      'custom-restricted',
    ]) {
      expect(assetLicenseClass(id)).toBe('research_only');
      expect(isShippableLicense(id)).toBe(false);
    }
  });

  it('treats an unrecognised license as unknown, never as shippable', () => {
    expect(assetLicenseClass('some-new-academic-terms')).toBe('unknown');
    expect(isShippableLicense('some-new-academic-terms')).toBe(false);
  });
});

describe('asset inspection', () => {
  it('reports counts, bounds and license class', () => {
    const report = inspectBaseHeadAsset(makeAsset());
    expect(report.valid).toBe(true);
    expect(report.vertexCount).toBe(4);
    expect(report.triangleCount).toBe(2);
    expect(report.shippable).toBe(true);
    expect(report.hasUvs).toBe(true);
    expect(report.landmarkCount).toBe(2);
    expect(report.bounds.min.y).toBeCloseTo(1.8, 5);
    expect(report.bounds.max.y).toBeCloseTo(1.92, 5);
  });

  it('rejects out-of-range indices', () => {
    const report = inspectBaseHeadAsset(makeAsset({ indices: new Uint32Array([0, 1, 99]) }));
    expect(report.valid).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain('index_range');
  });

  it('rejects non-finite positions and mismatched attribute counts', () => {
    expect(
      inspectBaseHeadAsset(
        makeAsset({ positions: new Float32Array([0, Number.NaN, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]) }),
      ).issues.map((i) => i.code),
    ).toContain('positions_nonfinite');

    expect(
      inspectBaseHeadAsset(makeAsset({ uvs: new Float32Array([0, 0]) })).issues.map((i) => i.code),
    ).toContain('uvs_count');
  });

  it('rejects a landmark pointing at a missing vertex', () => {
    const report = inspectBaseHeadAsset(
      makeAsset({ landmarks: [{ name: 'nasion', vertexIndex: 40 }] }),
    );
    expect(report.issues.map((i) => i.code)).toContain('landmark_range');
  });

  it('rejects a blendshape with a delta count mismatch', () => {
    const report = inspectBaseHeadAsset(
      makeAsset({
        blendshapes: [
          { name: 'jaw_open', indices: new Uint32Array([0, 1]), deltas: new Float32Array([0, 1]) },
        ],
      }),
    );
    expect(report.issues.map((i) => i.code)).toContain('blendshape_stride');
  });
});

describe('normal generation', () => {
  it('produces unit-length deterministic normals', () => {
    const asset = makeAsset();
    const a = computeAssetNormals(asset.positions, asset.indices);
    const b = computeAssetNormals(asset.positions, asset.indices);
    expect(Array.from(a)).toEqual(Array.from(b));
    for (let i = 0; i < a.length; i += 3) {
      expect(Math.hypot(a[i], a[i + 1], a[i + 2])).toBeCloseTo(1, 5);
    }
  });
});

describe('BaseHeadProvider', () => {
  it('feeds a permissive asset through the canonical seam', async () => {
    const provider = new BaseHeadProvider(makeAsset());
    const loaded = await provider.load();
    expect(loaded.topology.vertices).toHaveLength(4);
    expect(loaded.topology.parts).toHaveLength(1);
    expect(loaded.topology.parts[0].kind).toBe('skin');
    expect(provider.topologyVersion()).toBe('base-head-0.1');
    expect(loaded.metadata?.note).toContain('license=MIT');
  });

  it('assigns skeleton weights and a semantic region to every vertex', async () => {
    const loaded = await new BaseHeadProvider(makeAsset()).load();
    for (const v of loaded.topology.vertices) {
      expect(typeof v.region).toBe('string');
      const total = Object.values(v.weights).reduce((s, w) => s + w, 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('converts vertex landmarks into surface-relative landmarks', async () => {
    const loaded = await new BaseHeadProvider(makeAsset()).load();
    expect(loaded.landmarks.map((l) => l.name)).toEqual(['nasion', 'gnathion']);
    for (const lm of loaded.landmarks) {
      expect(lm.triangleId).toBeGreaterThanOrEqual(0);
      expect(lm.barycentric.reduce((s, b) => s + b, 0)).toBeCloseTo(1, 6);
    }
  });

  it('refuses to bake a research-only head by default', async () => {
    const provider = new BaseHeadProvider(makeAsset({ license: 'flame-license' }));
    await expect(provider.load()).rejects.toBeInstanceOf(BaseHeadLicenseError);
    expect(provider.inspect().shippable).toBe(false);
  });

  it('refuses an unknown license too, rather than assuming permission', async () => {
    await expect(
      new BaseHeadProvider(makeAsset({ license: 'mystery-terms' })).load(),
    ).rejects.toBeInstanceOf(BaseHeadLicenseError);
  });

  it('still loads a research-only head for explicit evaluation', async () => {
    const provider = new BaseHeadProvider(makeAsset({ license: 'metha-research' }), {
      requireShippable: false,
    });
    const loaded = await provider.load();
    expect(loaded.topology.vertices).toHaveLength(4);
    expect(loaded.metadata?.note).toContain('research_only');
  });

  it('throws on a structurally invalid asset', async () => {
    await expect(
      new BaseHeadProvider(makeAsset({ indices: new Uint32Array([0, 1, 99]) })).load(),
    ).rejects.toThrow(/structurally invalid/);
  });

  it('gates on anthropometric proportions only when asked', async () => {
    // The 4-vertex patch cannot satisfy the canons; default load succeeds anyway.
    await expect(new BaseHeadProvider(makeAsset()).load()).resolves.toBeDefined();
    await expect(
      new BaseHeadProvider(makeAsset(), { requireProportions: true }).load(),
    ).rejects.toThrow(/anthropometric canons/);
  });

  it('exposes carried blendshapes for the sparse morph pipeline', () => {
    const provider = new BaseHeadProvider(
      makeAsset({
        blendshapes: [
          {
            name: 'jaw_open',
            indices: new Uint32Array([3]),
            deltas: new Float32Array([0, -0.01, 0.002]),
          },
        ],
      }),
    );
    expect(provider.blendshapes()).toHaveLength(1);
    expect(provider.blendshapes()[0].name).toBe('jaw_open');
  });
});
