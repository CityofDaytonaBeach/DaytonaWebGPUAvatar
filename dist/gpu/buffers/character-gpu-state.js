/**
 * GPU-resident character state manager. Keeps hot character state on the GPU:
 * base vertices, working vertices, normals, parameter buffer. CPU sends small
 * state changes; the GPU computes deformation.
 *
 * v0.1 stores the canonical block human into GPU buffers and updates the
 * parameter buffer from the HumanDefinition.
 */
export class CharacterGpuState {
    device;
    paramBuffer;
    basePositionBuffer;
    normalBuffer;
    uvBuffer;
    indexBuffer;
    vertexCount;
    indexCount;
    paramByteSize;
    paramUpload;
    constructor(device, vertexPositions, normals, uvs, indices, paramByteSize) {
        this.device = device;
        this.vertexCount = vertexPositions.length / 3;
        this.indexCount = indices.length;
        this.paramByteSize = paramByteSize;
        this.paramUpload = new Float32Array(paramByteSize / 4);
        this.paramBuffer = device.createBuffer({
            size: paramByteSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.basePositionBuffer = createVertexBuffer(device, vertexPositions, 'base positions');
        this.normalBuffer = createVertexBuffer(device, normals, 'normals');
        this.uvBuffer = createVertexBuffer(device, uvs ?? new Float32Array((vertexPositions.length / 3) * 2), 'uvs');
        this.indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        writeBuffer(device, this.indexBuffer, 0, indices);
    }
    /** Upload the current parameter values into the GPU uniform buffer. */
    uploadParameters(definition) {
        definition.writeToBuffer(this.paramUpload);
        writeBuffer(this.device, this.paramBuffer, 0, this.paramUpload);
    }
}
/** Cast standard typed arrays into the WebGPU buffer-source type. */
function writeBuffer(device, buffer, offset, data) {
    device.queue.writeBuffer(buffer, offset, data);
}
function createVertexBuffer(device, data, label) {
    const buf = device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label,
    });
    writeBuffer(device, buf, 0, data);
    return buf;
}
//# sourceMappingURL=character-gpu-state.js.map