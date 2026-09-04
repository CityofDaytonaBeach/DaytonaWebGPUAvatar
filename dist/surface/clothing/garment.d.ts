import { AnatomyDimensions } from '../../anatomy/parametric/parametric-anatomy.js';
import { HumanAttachment } from '../../attachments/attachment-system.js';
import { Vec3 } from '../../core/math/vec.js';
export type GarmentKind = 'shirt' | 'sleeve' | 'generic' | 'pants' | 'jacket' | 'hat' | 'shoes';
export interface GarmentVertex {
    position: Vec3;
    uv: {
        u: number;
        v: number;
    };
}
export interface GarmentMesh {
    id: string;
    kind: GarmentKind;
    vertices: GarmentVertex[];
    indices: Uint32Array;
    color: [number, number, number];
}
export interface GarmentOptions {
    defaultColor?: [number, number, number];
    looseness?: number;
}
/** Flat, GPU-ready mesh: interleaved attribute arrays for direct WebGPU buffer upload. */
export interface GarmentRenderMesh {
    id: string;
    kind: GarmentKind;
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    color: [number, number, number];
    vertexCount: number;
    indexCount: number;
}
/** Cloth-simulation mesh: particles (rest positions + masses) + constraints (springs). */
export interface ClothParticle {
    position: Vec3;
    previousPosition: Vec3;
    acceleration: Vec3;
    mass: number;
    pinned: boolean;
}
export interface ClothConstraint {
    a: number;
    b: number;
    restLength: number;
    stiffness: number;
}
export interface GarmentPhysicsMesh {
    id: string;
    kind: GarmentKind;
    particles: ClothParticle[];
    constraints: ClothConstraint[];
    /** Mapping from render-mesh triangle index â†’ particle triple. */
    triangleParticleMap: [number, number, number][];
    gravity: Vec3;
    damping: number;
}
/** LOD levels: 0 = full, 1 = medium, 2 = low. */
export type GarmentLODLevel = 0 | 1 | 2;
export interface GarmentLODMesh {
    level: GarmentLODLevel;
    render: GarmentRenderMesh;
    physics: GarmentPhysicsMesh;
}
export declare function generateGarments(attachments: HumanAttachment[], dims: AnatomyDimensions, options?: GarmentOptions): GarmentMesh[];
export declare function generateGarment(attachment: HumanAttachment, dims: AnatomyDimensions, options?: GarmentOptions): GarmentMesh;
/** Convert a GarmentMesh into a flat, GPU-ready GarmentRenderMesh with computed normals. */
export declare function toRenderMesh(garment: GarmentMesh): GarmentRenderMesh;
/** Create a cloth-simulation mesh from a garment for physics integration. */
export declare function toPhysicsMesh(garment: GarmentMesh, options?: {
    gravity?: Vec3;
    damping?: number;
    particleMass?: number;
}): GarmentPhysicsMesh;
/** Run a single cloth simulation step (Verlet integration + constraint relaxation). */
export declare function simulateClothStep(physics: GarmentPhysicsMesh, dt: number, solverIterations?: number): void;
/** Apply drape simulation: constrains cloth particles to conform to body surface with gravity. */
export declare function applyDrape(physics: GarmentPhysicsMesh, bodySurface: (point: Vec3) => Vec3, attachmentRegions: Map<number, string>, dims: AnatomyDimensions, dt?: number, steps?: number): void;
/** Generate wrinkle/fold displacement offsets for garment vertices. */
export declare function generateWrinkles(garment: GarmentMesh, dims: AnatomyDimensions, options?: {
    frequency?: number;
    amplitude?: number;
    seed?: number;
}): Vec3[];
/** Apply wrinkle offsets to a render mesh (mutates in place). */
export declare function applyWrinkles(renderMesh: GarmentRenderMesh, offsets: Vec3[]): void;
/** Generate full LOD chain for a garment (LOD 0 = original, 1 = half, 2 = quarter). */
export declare function generateGarmentLODs(attachment: HumanAttachment, dims: AnatomyDimensions, options?: GarmentOptions): GarmentLODMesh[];
/** Select the best LOD level based on screen-space size or distance. */
export declare function selectLOD(distance: number, lodThresholds?: [number, number]): GarmentLODLevel;
//# sourceMappingURL=garment.d.ts.map