export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
export interface Vec4 {
    x: number;
    y: number;
    z: number;
    w: number;
}
export interface Quat {
    x: number;
    y: number;
    z: number;
    w: number;
}
export declare function vec3(x?: number, y?: number, z?: number): Vec3;
export declare const IDENTITY_QUAT: Quat;
export declare function identityMatrix(): Float32Array;
export declare function multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array;
//# sourceMappingURL=vec.d.ts.map