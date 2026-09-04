import { SKIN_COMPUTE_WGSL } from '../../render/wgsl/skin-wgsl.js';
/**
 * Dispatches the GPU skinning compute pass. Reads GPU-resident positions (the
 * morph-deformed working buffer), per-vertex bone influences, and a skin matrix
 * buffer; writes skinned positions a renderer can bind. At the rest pose the
 * skin matrices are identity, so output equals input â€” animation alone moves
 * the vertices bound to rotated bones.
 */
export class SkinningKernel {
    device;
    paramsBuffer;
    inBuffer;
    indicesBuffer;
    weightsBuffer;
    matricesBuffer;
    outBuffer;
    inNormalBuffer;
    outNormalBuffer;
    pipeline;
    bindGroup;
    vertexCount;
    constructor(device, vertexCount, inputPositions, influences, boneMatrices, numBones, inputNormals) {
        this.device = device;
        this.vertexCount = vertexCount;
        this.inBuffer = inputPositions;
        this.inNormalBuffer = inputNormals;
        this.paramsBuffer = makeStorage(device, 16, makeParams(vertexCount, numBones));
        this.indicesBuffer = makeStorage(device, influences.indices.byteLength, influences.indices);
        this.weightsBuffer = makeStorage(device, influences.weights.byteLength, influences.weights);
        this.outBuffer = makeStorage(device, vertexCount * 12);
        this.outNormalBuffer = makeStorage(device, vertexCount * 12);
        this.pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: device.createShaderModule({ code: SKIN_COMPUTE_WGSL }) },
        });
        this.matricesBuffer = makeStorage(device, boneMatrices.byteLength, boneMatrices);
        this.bindGroup = this.bind();
    }
    bind() {
        return this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.paramsBuffer } },
                { binding: 1, resource: { buffer: this.inBuffer } },
                { binding: 2, resource: { buffer: this.indicesBuffer } },
                { binding: 3, resource: { buffer: this.weightsBuffer } },
                { binding: 4, resource: { buffer: this.matricesBuffer } },
                { binding: 5, resource: { buffer: this.outBuffer } },
                { binding: 6, resource: { buffer: this.inNormalBuffer } },
                { binding: 7, resource: { buffer: this.outNormalBuffer } },
            ],
        });
    }
    /** Dispatch skinning into the current encoder. */
    dispatch(encoder) {
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(Math.ceil(this.vertexCount / 64));
        pass.end();
    }
    /** Upload a new set of combined skin matrices (animation update). */
    setBoneMatrices(boneMatrices) {
        this.matricesBuffer.destroy();
        this.matricesBuffer = makeStorage(this.device, boneMatrices.byteLength, boneMatrices);
        this.bindGroup = this.bind();
    }
    get outputBuffer() {
        return this.outBuffer;
    }
    get outputNormalsBuffer() {
        return this.outNormalBuffer;
    }
}
function makeStorage(device, size, data) {
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const buf = device.createBuffer({ size, usage });
    if (data)
        device.queue.writeBuffer(buf, 0, data);
    return buf;
}
function makeParams(vertexCount, boneCount) {
    const view = new Uint32Array(4);
    view[0] = vertexCount;
    view[1] = boneCount;
    return new Uint8Array(view.buffer);
}
//# sourceMappingURL=skinning-kernel.js.map