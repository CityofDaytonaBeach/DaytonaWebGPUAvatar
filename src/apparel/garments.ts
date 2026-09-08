/**
 * Garments as a surface partition of the body skin.
 *
 * Cloth simulation (`src/cloth`) grows separate garment geometry; that is the
 * long-term path for flowing fabric. A kiosk avatar, however, wears fitted
 * clothing — a polo and flat-front pants — that follows the body almost
 * exactly. For those, splitting the body's own watertight surface into skin /
 * shirt / trousers draw calls is both cheaper and more robust: no penetration,
 * no simulation cost, no seams, and the split is a pure function of the
 * semantic regions the canonical human already carries.
 *
 * The split never changes topology or vertex data. It only re-groups triangles
 * into additional draw ranges, each with its own material, so the identity /
 * morph / skinning pipeline is untouched.
 */

import { CanonicalHuman } from '../geometry/canonical/canonical-human.js';
import { regionGroup } from '../geometry/canonical/region-groups.js';

export type GarmentStyle = 'none' | 'polo';

export interface GarmentSpec {
  style: GarmentStyle;
  /** Linear RGB of the shirt fabric. */
  shirtColor: [number, number, number];
  /** Linear RGB of the trousers. */
  pantsColor: [number, number, number];
  /** 0 = short sleeve at the shoulder, 1 = sleeve to the elbow. */
  sleeveLength: number;
  /** Fabric roughness; higher reads as cotton, lower as technical fabric. */
  fabricRoughness: number;
}

export const DEFAULT_GARMENT: GarmentSpec = {
  style: 'polo',
  // City-staff look: deep navy polo, warm stone chinos.
  shirtColor: [0.05, 0.09, 0.19],
  pantsColor: [0.3, 0.28, 0.24],
  sleeveLength: 0.55,
  fabricRoughness: 0.85,
};

/** Which surface a triangle belongs to once dressed. */
export type GarmentLayer = 'skin' | 'shirt' | 'pants';

export interface GarmentSplit {
  skin: Uint32Array;
  shirt: Uint32Array;
  pants: Uint32Array;
}

/**
 * Classify one body vertex. `t` is its height normalised over the body's own
 * vertical extent, which keeps the split correct for any stature morph.
 */
export function garmentLayerForVertex(region: string, t: number, spec: GarmentSpec): GarmentLayer {
  if (spec.style === 'none') return 'skin';
  const group = regionGroup(region as never);
  switch (group) {
    case 'torso':
      // Collar opens below the neck; hem sits just under the waist.
      return t > 0.82 || t < 0.5 ? 'skin' : 'shirt';
    case 'upperarm_l':
    case 'upperarm_r': {
      // Sleeve runs down from the shoulder by `sleeveLength`.
      const sleeveEnd = 0.78 - 0.16 * spec.sleeveLength;
      return t > sleeveEnd ? 'shirt' : 'skin';
    }
    case 'thigh_l':
    case 'thigh_r':
      return 'pants';
    case 'shin_l':
    case 'shin_r':
      // Trouser break above the ankle.
      return t > 0.06 ? 'pants' : 'skin';
    default:
      return 'skin';
  }
}

/**
 * Partition the body's triangle range into skin / shirt / pants ranges.
 * A triangle joins a garment only when all three of its corners do, so garment
 * borders fall exactly on the mesh edges rather than mid-triangle.
 */
export function splitBodyByGarment(
  canonical: CanonicalHuman,
  bodyIndexEnd: number,
  spec: GarmentSpec,
): GarmentSplit {
  const skin: number[] = [];
  const shirt: number[] = [];
  const pants: number[] = [];
  if (spec.style === 'none') {
    return {
      skin: canonical.indices.slice(0, bodyIndexEnd),
      shirt: new Uint32Array(0),
      pants: new Uint32Array(0),
    };
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of canonical.vertices) {
    if (v.position.y < minY) minY = v.position.y;
    if (v.position.y > maxY) maxY = v.position.y;
  }
  const span = maxY - minY || 1;

  const layerOf = new Array<GarmentLayer>(canonical.vertices.length);
  for (let i = 0; i < canonical.vertices.length; i++) {
    const v = canonical.vertices[i];
    layerOf[i] = garmentLayerForVertex(v.region, (v.position.y - minY) / span, spec);
  }

  for (let i = 0; i + 2 < bodyIndexEnd; i += 3) {
    const a = canonical.indices[i];
    const b = canonical.indices[i + 1];
    const c = canonical.indices[i + 2];
    const la = layerOf[a];
    const bucket = la !== 'skin' && la === layerOf[b] && la === layerOf[c] ? la : 'skin';
    const out = bucket === 'shirt' ? shirt : bucket === 'pants' ? pants : skin;
    out.push(a, b, c);
  }

  return {
    skin: new Uint32Array(skin),
    shirt: new Uint32Array(shirt),
    pants: new Uint32Array(pants),
  };
}
