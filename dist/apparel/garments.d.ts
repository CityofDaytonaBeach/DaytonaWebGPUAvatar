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
export declare const DEFAULT_GARMENT: GarmentSpec;
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
export declare function garmentLayerForVertex(region: string, t: number, spec: GarmentSpec): GarmentLayer;
/**
 * Partition the body's triangle range into skin / shirt / pants ranges.
 * A triangle joins a garment only when all three of its corners do, so garment
 * borders fall exactly on the mesh edges rather than mid-triangle.
 */
export declare function splitBodyByGarment(canonical: CanonicalHuman, bodyIndexEnd: number, spec: GarmentSpec): GarmentSplit;
//# sourceMappingURL=garments.d.ts.map