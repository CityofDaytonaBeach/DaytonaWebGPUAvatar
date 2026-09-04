import { Quat, Vec3 } from '../../core/math/vec.js';
import { BoneDef } from './skeleton.js';
import { BonePose } from '../../animation/skeleton/skeletal-animation.js';
/**
 * Forward-kinematics + skin-matrix construction for the parametric skeleton.
 *
 * `buildBoneMatrices` walks the rest skeleton and every pose into a per-bone
 * *current* world matrix (translation then rotation, chained by parent). The
 * classic skinned-animation formulation then combines inverse-bind with the
 * current matrix per bone: `skinMatrix = invBindWorld * currentWorld`, so at the
 * rest pose every skin matrix is the identity (vertices stay put) and rotating a
 * bone transforms exactly the vertices bound to it.
 */
export declare function buildBoneMatrices(bones: BoneDef[], poses?: BonePose[]): {
    current: Float32Array;
    bind: Float32Array;
    inverseBind: Float32Array;
};
/**
 * Combined per-bone skinning matrices (mat4 per bone = count*16 floats), in
 * skeleton order so index `i` matches `CanonicalHuman.boneId(name)` ordering.
 * At the rest pose every matrix is the identity.
 */
export declare function combinedSkinMatrices(bones: BoneDef[], poses?: BonePose[]): Float32Array;
export declare function identityMatrix(): Float32Array;
export declare function composeMatrix(t: Vec3, q: Quat): Float32Array;
/** Invert an affine transform (rotation+scale upper 3x3, translation col). */
export declare function invertMatrix(m: Float32Array): Float32Array;
//# sourceMappingURL=bone-matrix.d.ts.map