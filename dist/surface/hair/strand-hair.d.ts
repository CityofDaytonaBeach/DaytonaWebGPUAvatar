import { HumanDefinition } from '../../core/schema/human-definition.js';
import { Vec3 } from '../../core/math/vec.js';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
export interface HairStrandPoint {
    position: Vec3;
    radius: number;
}
export interface HairStrand {
    id: number;
    rootVertexId: number;
    points: HairStrandPoint[];
}
export interface StrandHairGeometry {
    strands: HairStrand[];
    color: [number, number, number];
}
export interface StrandHairOptions {
    maxStrands?: number;
    segments?: number;
}
/**
 * Deterministic prototype strand-hair runtime. It samples stable scalp anchors
 * from the canonical head and expands HDL hair parameters into strand polylines.
 */
export declare function generateStrandHair(definition: HumanDefinition, canonical: CanonicalHuman, options?: StrandHairOptions): StrandHairGeometry;
export declare function countHairVertices(hair: StrandHairGeometry): number;
/** A group of nearby strands that move/share volume together. */
export interface HairClump {
    /** Id of the clump (stable ordering across the scalp). */
    id: number;
    /** Mean root position of every member strand. */
    center: Vec3;
    /** Strand ids in this clump. */
    strandIds: number[];
    /** Per-strand membership bias in [0,1]; 0 = peripheral, 1 = core strand. */
    bias: number;
}
export interface ClumpOptions {
    /** Number of clumps to form (defaults to ~15% of strand count). */
    clumps?: number;
    /** Seed for deterministic binning of strands into clumps. */
    seed?: number;
}
/**
 * Deterministically bin the strands in a geometry into local clumps by their
 * root direction around the scalp center. Strands are sorted into an azimuthal
 * order and split into contiguous buckets so members are always neighbours.
 */
export declare function clumpStrands(hair: StrandHairGeometry, options?: ClumpOptions): HairClump[];
export interface ThicknessTaper {
    /** Radius at the root. */
    rootRadius: number;
    /** Radius at the tip. */
    tipRadius: number;
}
export interface TaperOptions {
    taper?: ThicknessTaper;
    /** Exponent shaping the falloff; 1 = linear, >1 = tip-heavy. */
    curve?: number;
}
/**
 * Re-radiusing every strand between an explicit root and tip thickness,
 * shaped by a power curve. Fully deterministic and returns a new geometry
 * without mutating the input.
 */
export declare function taperStrandThickness(hair: StrandHairGeometry, options?: TaperOptions): StrandHairGeometry;
export interface WindField {
    /** Base wind direction/velocity. */
    direction: Vec3;
    /** Overall strength multiplier. */
    strength: number;
}
export interface WindOptions {
    /** Wind gust magnitude along the field. */
    gusts?: number;
    /** Angular/phase offset applied per strand, driven by time. */
    frequency?: number;
    /** Deterministic seed for strand phase offsets. */
    seed?: number;
}
/**
 * Apply a time-varying wind perturbation to every strand. Offsets are a product
 * of the strand's seed phase and its normalized height so tips sway more than
 * roots. Returns a new geometry; the input is never mutated.
 */
export declare function applyHairWind(hair: StrandHairGeometry, wind: WindField, time: number, options?: WindOptions): StrandHairGeometry;
export type HairLodLevel = 0 | 1 | 2 | 3;
/** Per-LOD hardware/CPU budgets used when no explicit cap is supplied. */
export declare const HAIR_LOD_BUDGETS: Record<HairLodLevel, number>;
export interface LodOptions {
    /** Hard cap on strand count; defaults to HAIR_LOD_BUDGETS[level]. */
    maxStrands?: number;
}
/**
 * Reduce strand count for a level of detail while preserving root distribution
 * exactly like the generator (uniform decimation over the sorted anchor space).
 * Returned geometry is a new object and stays deterministic.
 */
export declare function reduceStrandsForLOD(hair: StrandHairGeometry, level: HairLodLevel, options?: LodOptions): StrandHairGeometry;
export interface HairColorOption {
    /** Base RGB color (unvarying component). Defaults to the geometry color. */
    base?: [number, number, number];
    /** Max per-channel deviance applied around the base. */
    variance?: number;
    /** Deterministic seed for the variation stream. */
    seed?: number;
}
/** Per-strand resolved color, keyed by strand id. */
export type StrandColorMap = Map<number, [number, number, number]>;
/**
 * Deterministically assign a slightly varied color to every strand. The first
 * color in the stream is always the unvarying base so the primary hair color
 * is preserved; subsequent strands get bounded, seeded deviance.
 */
export declare function strandColors(hair: StrandHairGeometry, options?: HairColorOption): StrandColorMap;
/** A single corner of a hair card (ribbon segment). */
export interface HairCardVertex {
    position: Vec3;
    /** UV: u across the ribbon width, v along strand length (0 root â†’ 1 tip). */
    uv: {
        u: number;
        v: number;
    };
    strandId: number;
}
/** A quad ribbon segment bridging two consecutive strand points. */
export interface HairCard {
    a: HairCardVertex;
    b: HairCardVertex;
    c: HairCardVertex;
    d: HairCardVertex;
}
/** GPU-friendly flattened triangle mesh built from strand cards. */
export interface HairRenderMesh {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    /** Quad cards, one per strand segment (segments Ã— strands). */
    cards: HairCard[];
    vertexCount: number;
    triangleCount: number;
}
export interface HairMeshOptions {
    /** Ribbon width relative to local strand radius (default 2). */
    widthScale?: number;
    /** Direction pair used to orient cards: "face" (toward +z) or "radial". */
    mode?: 'face' | 'radial';
}
/**
 * Build a renderable triangle mesh by turning every strand polyline into a
 * strip of quad "cards" (ribbons). Each quad is split into two triangles. The
 * ribbon nurmally faces the camera via the `face` mode or flares radially from
 * each strand via `radial` mode.
 */
export declare function buildHairMesh(hair: StrandHairGeometry, options?: HairMeshOptions): HairRenderMesh;
export interface HairSimulationOptions {
    /** Downward acceleration (default {0, -9.81, 0}). */
    gravity?: Vec3;
    /** Velocity damping per step in [0,1] (default 0.92). */
    damping?: number;
    /** Pull toward the rest pose in [0,1] (default 0.35). */
    stiffness?: number;
    /** Ambient wind acting on every non-root particle. */
    wind?: Vec3;
    /** Scalar multiplier on the wind field. */
    windStrength?: number;
    /** Fixed integration time-step in seconds (default 1/60). */
    dt?: number;
    /** Deterministic seed for per-strand phase offsets. */
    seed?: number;
}
/**
 * Deterministic, fixed-timestep spring/gravity strand solver. Each strand is a
 * chain of particles pinned at the root. On every step gravity and wind are
 * integrated, velocity is damped, segment lengths are kept near their rest
 * length, and a small stiffness pulls the chain back toward its rest pose.
 */
export declare class HairSim {
    readonly strands: HairStrand[];
    private readonly color;
    private particles;
    private readonly options;
    private readonly phase;
    constructor(hair: StrandHairGeometry, options?: HairSimulationOptions);
    get committed(): StrandHairGeometry;
    /** Advance the simulation by one fixed timestep. */
    step(): void;
    /** Advance by `n` fixed timesteps. */
    steps(n: number): void;
    private integrate;
    private solveConstraints;
}
//# sourceMappingURL=strand-hair.d.ts.map