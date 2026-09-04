export function vec3(x = 0, y = 0, z = 0) {
    return { x, y, z };
}
export const IDENTITY_QUAT = { x: 0, y: 0, z: 0, w: 1 };
export function identityMatrix() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function multiplyMatrices(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let sum = 0;
            for (let k = 0; k < 4; k++)
                sum += a[k * 4 + r] * b[c * 4 + k];
            out[c * 4 + r] = sum;
        }
    }
    return out;
}
//# sourceMappingURL=vec.js.map