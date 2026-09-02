import { describe, it, expect } from 'vitest';
import { CanonicalHuman } from './canonical-human.js';
import {
  DebugBlockHumanProvider,
  CanonicalHumanProviderRegistry,
  DEFAULT_PROVIDER_BONE_NAMES,
  topologyFromHuman,
} from './canonical-provider.js';
import { validateCanonicalTopology } from './canonical-validator.js';
import { HumanLandmark, resolveLandmarkPosition, findTriangleInRegion } from './landmark.js';
import { Human } from '../../human.js';

describe('DebugBlockHumanProvider (block human is preserved as a provider)', () => {
  it('loads a valid canonical asset with the v0.1 contract', async () => {
    const provider = new DebugBlockHumanProvider();
    const asset = await provider.load();
    expect(asset.version).toMatch(/DaytonaCanonicalHuman/);
    expect(asset.topology.vertices.length).toBeGreaterThan(0);
    expect(provider.validate().valid).toBe(true);
    expect(provider.topologyVersion()).toBe('block-0.1');
  });

  it('produced topology round-trips through the canonical validator', async () => {
    const provider = new DebugBlockHumanProvider();
    const report = validateCanonicalTopology((await provider.load()).topology);
    expect(report.valid).toBe(true);
    expect(report.vertexCount).toBe((await provider.load()).topology.vertices.length);
  });

  it('registry selects providers by key', async () => {
    const reg = new CanonicalHumanProviderRegistry();
    reg.register('block', new DebugBlockHumanProvider());
    expect(reg.keys()).toEqual(['block']);
    expect(await reg.get('block')!.load()).toBeDefined();
    expect(reg.get('missing')).toBeUndefined();
  });
});

describe('Surface-relative landmarks (stable identity anchors)', () => {
  it('resolves a landmark on the first nose triangle to a finite position', () => {
    const canonical = new CanonicalHuman([...DEFAULT_PROVIDER_BONE_NAMES]);
    const tri = findTriangleInRegion(canonical, 'nose');
    expect(tri).toBeGreaterThanOrEqual(0);
    const lm: HumanLandmark = {
      id: 0,
      name: 'nose_tip',
      triangleId: tri,
      barycentric: [1, 0, 0],
      normalOffset: 0.002,
    };
    const resolved = resolveLandmarkPosition(canonical, lm);
    expect(resolved).not.toBeNull();
    const { position } = resolved!;
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
    expect(Number.isFinite(position.z)).toBe(true);
  });

  it('returns null for an out-of-range triangle id', () => {
    const canonical = new CanonicalHuman([...DEFAULT_PROVIDER_BONE_NAMES]);
    const lm: HumanLandmark = {
      id: 1,
      name: 'bad',
      triangleId: canonical.triangleCount + 5,
      barycentric: [1 / 3, 1 / 3, 1 / 3],
      normalOffset: 0,
    };
    expect(resolveLandmarkPosition(canonical, lm)).toBeNull();
  });

  it('normalized the resolved normal to unit length', () => {
    const canonical = new CanonicalHuman([...DEFAULT_PROVIDER_BONE_NAMES]);
    const tri = findTriangleInRegion(canonical, 'mouth');
    const lm: HumanLandmark = {
      id: 2,
      name: 'mouth',
      triangleId: tri,
      barycentric: [1 / 3, 1 / 3, 1 / 3],
      normalOffset: 0,
    };
    const resolved = resolveLandmarkPosition(canonical, lm);
    const n = resolved!.normal;
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
  });
});

describe('topologyFromHuman', () => {
  it('produces a topology compatible with the canonical structure', () => {
    const canonical = new CanonicalHuman([...DEFAULT_PROVIDER_BONE_NAMES]);
    const top = topologyFromHuman(canonical);
    expect(top.indices.length / 3).toBe(canonical.triangleCount);
    expect(top.parts.length).toBe(canonical.parts.length);
    expect(top.vertices[0].id).toBe(0);
  });
});

describe('Provider-driven canonical ingestion (P2/P3 arch seam)', () => {
  it('CanonicalHuman.fromTopology reproduces the source geometry', async () => {
    const provider = new DebugBlockHumanProvider();
    const asset = await provider.load();
    const rebuilt = CanonicalHuman.fromTopology(asset.topology, DEFAULT_PROVIDER_BONE_NAMES);
    expect(rebuilt.vertexCount).toBe(asset.topology.vertices.length);
    expect(rebuilt.triangleCount).toBe(asset.topology.indices.length / 3);
    expect(rebuilt.regionRanges.has('nose')).toBe(true);
    expect(rebuilt.partByRegion.has('eye_sclera')).toBe(true);
    for (let i = 0; i < rebuilt.vertices.length; i++) {
      expect(rebuilt.vertices[i].position.x).toBeCloseTo(asset.topology.vertices[i].position.x, 5);
    }
  });

  it('Human.create consumes a canonical provider to build its mesh', async () => {
    const human = await Human.create({ canonicalProvider: new DebugBlockHumanProvider() });
    expect(human.canonicalRef.vertexCount).toBeGreaterThan(0);
    const asset = await new DebugBlockHumanProvider().load();
    expect(human.canonicalRef.vertexCount).toBe(asset.topology.vertices.length);
  });

  it('Human without a provider still uses the default block human', async () => {
    const human = await Human.create();
    const asset = await new DebugBlockHumanProvider().load();
    expect(human.canonicalRef.vertexCount).toBe(asset.topology.vertices.length);
  });
});
