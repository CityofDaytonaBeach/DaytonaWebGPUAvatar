import { describe, it, expect } from 'vitest';
import { HDCanonicalHumanProvider } from './hd-head-provider.js';
import { CanonicalHuman } from './canonical-human.js';
import { REQUIRED_HD_HEAD_REGIONS, HD_HEAD_REGIONS, HD_HEAD_PART_REGIONS } from './regions.js';
import { resolveLandmarkPosition } from './landmark.js';
import { CanonicalHumanProviderRegistry } from './canonical-provider.js';
import { Human } from '../../human.js';

describe('HDCanonicalHumanProvider (P12 HD HEAD V0.1)', () => {
  it('loads a v0.1 asset with a real head topology', async () => {
    const provider = new HDCanonicalHumanProvider();
    const asset = await provider.load();
    expect(asset.version).toMatch(/DaytonaCanonicalHuman v0.1/);
    expect(asset.topology.vertices.length).toBeGreaterThan(500);
    expect(asset.topology.indices.length / 3).toBeGreaterThan(500);
    expect(provider.topologyVersion()).toBe('hd-head-0.1');
  });

  it('provides every required P4 HD head region', async () => {
    const provider = new HDCanonicalHumanProvider();
    const asset = await provider.load();
    const present = new Set(asset.topology.vertices.map((v) => v.region));
    for (const r of REQUIRED_HD_HEAD_REGIONS) expect(present.has(r)).toBe(true);
    expect(HD_HEAD_REGIONS.length).toBeGreaterThan(20);
  });

  it('validation passes the HD head contract', async () => {
    const provider = new HDCanonicalHumanProvider();
    const result = provider.validate();
    expect(result.valid).toBe(true);
    expect(result.issues.length).toBe(0);
  });

  it('emits detailed eye / teeth / tongue / cavity parts', async () => {
    const provider = new HDCanonicalHumanProvider();
    const asset = await provider.load();
    const partNames = new Set(asset.topology.parts.map((p) => p.name));
    for (const n of [
      'eye_l',
      'eye_r',
      'iris_l',
      'iris_r',
      'pupil_l',
      'pupil_r',
      'cornea_l',
      'cornea_r',
      'teeth_upper',
      'teeth_lower',
      'tongue',
      'mouth_cavity',
    ]) {
      expect(partNames.has(n)).toBe(true);
    }
    for (const p of asset.topology.parts) {
      expect(p.vertexStart + p.vertexCount).toBeLessThanOrEqual(asset.topology.vertices.length);
      expect(p.indexStart + p.indexCount).toBeLessThanOrEqual(asset.topology.indices.length);
    }
  });

  it('builds landmarks that resolve on the topology', async () => {
    const provider = new HDCanonicalHumanProvider();
    const asset = await provider.load();
    expect(asset.landmarks.length).toBeGreaterThanOrEqual(15);
    const canonical = CanonicalHuman.fromTopology(asset.topology, ['head', 'neck']);
    for (const lm of asset.landmarks.slice(0, 8)) {
      const resolved = resolveLandmarkPosition(canonical, lm);
      expect(resolved).not.toBeNull();
      expect(Number.isFinite(resolved!.position.x)).toBe(true);
    }
  });

  it('assigns skeleton skin weights (head vs neck)', async () => {
    const provider = new HDCanonicalHumanProvider();
    const asset = await provider.load();
    let sawNeck = false;
    for (const v of asset.topology.vertices) {
      expect(Object.keys(v.weights).length).toBeGreaterThan(0);
      const sum = Object.values(v.weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(0.001);
      if (v.region === 'neck') sawNeck = true;
    }
    expect(sawNeck).toBe(true);
  });

  it('round-trips through CanonicalHuman and the Human runtime', async () => {
    const provider = new HDCanonicalHumanProvider();
    const human = await Human.create({ canonicalProvider: provider });
    expect(human.canonicalRef.vertexCount).toBeGreaterThan(500);
    expect(human.canonicalRef.partByRegion.has('eye_sclera')).toBe(true);
    expect(human.canonicalRef.partByRegion.has('cornea')).toBe(true);
  });

  it('registers under the canonical provider registry', async () => {
    const reg = new CanonicalHumanProviderRegistry();
    reg.register('hd-head', new HDCanonicalHumanProvider());
    expect(reg.keys()).toContain('hd-head');
    const asset = await reg.get('hd-head')!.load();
    expect(asset.topology.vertices.length).toBeGreaterThan(0);
  });

  it('part regions are drawn from the HD part vocabulary', async () => {
    const provider = new HDCanonicalHumanProvider();
    const asset = await provider.load();
    const partRegions = new Set(asset.topology.parts.map((p) => p.region));
    for (const r of HD_HEAD_PART_REGIONS) expect(partRegions.has(r)).toBe(true);
  });
});
