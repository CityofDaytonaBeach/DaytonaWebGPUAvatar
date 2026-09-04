import { HumanSdfField } from '../sdf/human-sdf.js';
import { Vec3 } from '../../core/math/vec.js';
export interface ClothParticle {
    position: Vec3;
    previous: Vec3;
    pinned: boolean;
}
export interface ClothConstraint {
    a: number;
    b: number;
    restLength: number;
}
export interface ClothMesh {
    width: number;
    height: number;
    particles: ClothParticle[];
    constraints: ClothConstraint[];
}
export interface ClothStepOptions {
    dt?: number;
    gravity?: Vec3;
    iterations?: number;
    collisionPadding?: number;
}
export interface ClothWindConfig {
    direction: Vec3;
    strength: number;
    turbulence: number;
}
export interface CollisionPrimitive {
    kind: 'sphere' | 'capsule';
    center: Vec3;
    end?: Vec3;
    radius: number;
}
export interface ClothSimConfig {
    gravity: Vec3;
    dt: number;
    iterations: number;
    collisionPadding: number;
    damping: number;
    stiffness: number;
    tearThreshold: number;
    selfCollisionRadius: number;
    wind: ClothWindConfig;
    collisionPrimitives: CollisionPrimitive[];
}
export declare function seedTurbulence(seed: number): void;
/** Build a deterministic poncho/shirt-front cloth panel pinned near shoulders. */
export declare function createTorsoCloth(width?: number, height?: number): ClothMesh;
export declare function stepCloth(mesh: ClothMesh, sdf: HumanSdfField, options?: ClothStepOptions): ClothMesh;
export declare function stepClothAdvanced(mesh: ClothMesh, sdf: HumanSdfField, config: ClothSimConfig): ClothMesh;
export declare function simulateCloth(mesh: ClothMesh, sdf: HumanSdfField, steps: number, options?: ClothStepOptions): ClothMesh;
export declare function simulateClothAdvanced(mesh: ClothMesh, sdf: HumanSdfField, steps: number, config: ClothSimConfig): ClothMesh;
export declare function cloneCloth(mesh: ClothMesh): ClothMesh;
export declare function clothToGPUBuffer(mesh: ClothMesh): Float32Array;
export declare function clothConstraintsToGPUBuffer(mesh: ClothMesh): Uint32Array;
export declare function clothRestLengthsToGPUBuffer(mesh: ClothMesh): Float32Array;
export declare function meshToGPULayout(mesh: ClothMesh): {
    positions: Float32Array;
    previous: Float32Array;
    constraintIndices: Uint32Array;
    restLengths: Float32Array;
    pinnedMask: Uint8Array;
    count: number;
    constraintCount: number;
};
export declare function meshFromGPULayout(layout: {
    positions: Float32Array;
    previous: Float32Array;
    constraintIndices: Uint32Array;
    restLengths: Float32Array;
    pinnedMask: Uint8Array;
    count: number;
    constraintCount: number;
}): ClothMesh;
//# sourceMappingURL=cloth-sim.d.ts.map