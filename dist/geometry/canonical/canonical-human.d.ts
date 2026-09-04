import { Vec3 } from '../../core/math/vec.js';
import type { CanonicalTopology } from './canonical-topology.js';
export type RegionName = 'head' | 'face' | 'nose' | 'jaw' | 'eyes' | 'eye_sclera' | 'eye_iris' | 'mouth' | 'teeth' | 'tongue' | 'mouth_cavity' | 'neck' | 'torso' | 'upperarm_l' | 'upperarm_r' | 'forearm_l' | 'forearm_r' | 'hand_l' | 'hand_r' | 'thigh_l' | 'thigh_r' | 'shin_l' | 'shin_r' | 'forehead' | 'temple_left' | 'temple_right' | 'eye_left' | 'eye_right' | 'upper_eyelid_left' | 'lower_eyelid_left' | 'upper_eyelid_right' | 'lower_eyelid_right' | 'nose_bridge' | 'nose_tip' | 'nose_alar_left' | 'nose_alar_right' | 'cheek_left' | 'cheek_right' | 'upper_lip' | 'lower_lip' | 'mouth_corner_left' | 'mouth_corner_right' | 'jaw_left' | 'jaw_right' | 'chin' | 'ear_left' | 'ear_right' | 'cornea' | 'chest' | 'abdomen' | 'back' | 'shoulder_left' | 'shoulder_right' | 'upper_arm_left' | 'upper_arm_right' | 'forearm_left' | 'forearm_right' | 'hand_left' | 'hand_right' | 'pelvis' | 'thigh_left' | 'thigh_right' | 'shin_left' | 'shin_right' | 'foot_left' | 'foot_right';
/** Semantic part kind, used by the renderer to pick a shading path. */
export type PartKind = 'skin' | 'sclera' | 'iris' | 'limbus' | 'cornea' | 'cornea_optic' | 'teeth' | 'tongue' | 'mouth_cavity';
export interface PartGeometry {
    /** Stable part name, e.g. "eye_l", "teeth_upper", "tongue". */
    name: string;
    kind: PartKind;
    region: RegionName;
    /** Global vertex id where this part begins in CanonicalHuman.vertices[]. */
    vertexStart: number;
    vertexCount: number;
    /** Index offset into CanonicalHuman.indices[]. */
    indexStart: number;
    indexCount: number;
}
export interface Vertex {
    position: Vec3;
    normal: Vec3;
    uv: {
        u: number;
        v: number;
    };
    region: RegionName;
    /** Stable vertex id (index). */
    id: number;
    weights: Record<string, number>;
}
export interface MorphDelta {
    vertexId: number;
    dx: number;
    dy: number;
    dz: number;
}
export interface SparseMorph {
    name: string;
    deltas: MorphDelta[];
}
export interface IndexRange {
    start: number;
    count: number;
}
/**
 * Canonical Human Model.
 *
 * All normal humans derive from ONE compatible canonical topology. This v0.2
 * implementation procedurally generates the body (block human) PLUS separable
 * detail parts â€” sclera/iris eyes, upper/lower teeth, tongue, mouth cavity â€”
 * each with stable per-part vertex ranges, region tags and surface UVs.
 *
 * The body and each part are addressable as sub-meshes of a single global
 * vertex/index array so the morph/skinning/GPU pipeline stays unchanged while
 * parts expose independent identity (Phase 2 requirement: stable IDs, face
 * loops, weights, surface coordinates for each system).
 */
export declare class CanonicalHuman {
    readonly vertices: Vertex[];
    readonly indices: Uint32Array;
    readonly regionRanges: Map<RegionName, IndexRange>;
    /** Detail parts (eyes/teeth/tongue/mouth cavity). Body is part "body". */
    readonly parts: PartGeometry[];
    readonly partByRegion: Map<RegionName, PartGeometry>;
    /** Index range of each part in the global index array. */
    readonly partIndexRanges: Map<string, IndexRange>;
    private boneIndex;
    constructor(boneNames: string[], topology?: CanonicalTopology);
    /** Build a canonical human from an externally supplied topology + bones. */
    static fromTopology(topology: CanonicalTopology, boneNames: string[]): CanonicalHuman;
    get vertexCount(): number;
    get triangleCount(): number;
    /** Vertex range (global ids) of a part, or the body range (0..bodyStart). */
    partVertexRange(name: string): IndexRange | null;
    boneId(name: string): number;
    /** Copy base positions+normals into contiguous Float32Arrays. */
    baseGeometry(): {
        positions: Float32Array;
        normals: Float32Array;
    };
}
/**
 * Procedural block human: a simple humanoid built from boxes/slabs. This is the
 * body; detail parts (eyes/teeth/tongue/cavity) are appended by CanonicalHuman.
 */
export declare function generateBlockHuman(boneNames: string[]): {
    vertices: Vertex[];
    indices: Uint32Array;
};
//# sourceMappingURL=canonical-human.d.ts.map