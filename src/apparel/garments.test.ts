import { describe, expect, it } from 'vitest';
import { DEFAULT_GARMENT, garmentLayerForVertex, splitBodyByGarment } from './garments.js';
import { HDCanonicalHumanProvider } from '../geometry/canonical/hd-head-provider.js';
import { CanonicalHuman } from '../geometry/canonical/canonical-human.js';
import { DEFAULT_PROVIDER_BONE_NAMES as DEFAULT_BONE_NAMES } from '../geometry/canonical/canonical-provider.js';

describe('garments', () => {
  it('keeps the head, hands and feet bare', () => {
    for (const region of ['head', 'face', 'hand_l', 'foot_r', 'neck']) {
      expect(garmentLayerForVertex(region, 0.9, DEFAULT_GARMENT)).toBe('skin');
    }
  });

  it('dresses the torso and legs', () => {
    expect(garmentLayerForVertex('torso', 0.7, DEFAULT_GARMENT)).toBe('shirt');
    expect(garmentLayerForVertex('thigh_left', 0.35, DEFAULT_GARMENT)).toBe('pants');
    expect(garmentLayerForVertex('shin_left', 0.2, DEFAULT_GARMENT)).toBe('pants');
  });

  it('style none leaves every triangle on the skin', async () => {
    const asset = await new HDCanonicalHumanProvider({ quality: 'draft' }).load();
    const canonical = CanonicalHuman.fromTopology(asset.topology, DEFAULT_BONE_NAMES);
    const bodyEnd = canonical.parts[0]?.indexStart ?? canonical.indices.length;
    const bare = splitBodyByGarment(canonical, bodyEnd, { ...DEFAULT_GARMENT, style: 'none' });
    expect(bare.skin.length).toBe(bodyEnd);
    expect(bare.shirt.length + bare.pants.length).toBe(0);
  });

  it('partitions the body without losing or duplicating triangles', async () => {
    const asset = await new HDCanonicalHumanProvider({ quality: 'draft' }).load();
    const canonical = CanonicalHuman.fromTopology(asset.topology, DEFAULT_BONE_NAMES);
    const bodyEnd = canonical.parts[0]?.indexStart ?? canonical.indices.length;
    const split = splitBodyByGarment(canonical, bodyEnd, DEFAULT_GARMENT);
    expect(split.skin.length + split.shirt.length + split.pants.length).toBe(bodyEnd);
    expect(split.shirt.length).toBeGreaterThan(0);
    expect(split.pants.length).toBeGreaterThan(0);
  });
});
