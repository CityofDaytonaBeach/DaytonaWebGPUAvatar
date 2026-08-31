import { MORPH_COMPUTE_WGSL } from "../../render/wgsl/morph-wgsl";

const BYTES_PER_META = 16; // vec4f morph meta entry
const BYTES_PER_DELTA = 16; // vec4f delta quad

/**
 * Dispatches the sparse morph GPU-decompress compute. Owns the buffers and
 * pipeline for a single character. Call `dispatch()` each frame after updating
 * morph weights. Output lands in `outPositionBuffer`, which a renderer can bind.
 */
export class GpuMorphDeform {
  private readonly device: GPUDevice;

  // Storage buffers.
  private deltaBuffer: GPUBuffer;
  private morphBuffer: GPUBuffer;
  private paramsBuffer: GPUBuffer;
  private basePositionBuffer: GPUBuffer;
  private outPositionBuffer: GPUBuffer;

  private pipeline: GPUComputePipeline;
  private bindGroup: GPUBindGroup;
  private vertexCount: number;

  /**
   * @param deltaPacked Uint32Array from packSparseMorphs (index,dx,dy,dz quads).
   * @param morphStruct Uint32Array from packSparseMorphs (per-morph meta).
   */
  constructor(
    device: GPUDevice,
    vertexCount: number,
    basePositions: Float32Array,
    deltaPacked: Uint32Array,
    morphStruct: Uint32Array
  ) {
    this.device = device;
    this.vertexCount = vertexCount;

    const deltaBytes = deltaPacked.byteLength;
    const morphBytes = morphStruct.byteLength;
    const baseBytes = vertexCount * 12;
    const outBytes = vertexCount * 12;

    this.deltaBuffer = makeStorage(device, deltaBytes, deltaPacked);
    this.morphBuffer = makeStorage(device, morphBytes, morphStruct);
    this.paramsBuffer = makeStorage(device, 16, makeParams(vertexCount, morphStruct.byteLength / BYTES_PER_META));
    this.basePositionBuffer = makeStorage(device, baseBytes, new Uint8Array(basePositions.buffer, basePositions.byteOffset, baseBytes));
    this.outPositionBuffer = makeStorage(device, outBytes);

    this.pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: MORPH_COMPUTE_WGSL }) },
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.basePositionBuffer } },
        { binding: 2, resource: { buffer: this.deltaBuffer } },
        { binding: 3, resource: { buffer: this.morphBuffer } },
        { binding: 4, resource: { buffer: this.outPositionBuffer } },
      ],
    });
  }

  /** Dispatch the morph compute pass into the current encoder. */
  dispatch(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.vertexCount / 64));
    pass.end();
  }

  /** Update morph weights from a name->weight map. */
  writeWeights(morphStructBuffer: Uint32Array): void {
    this.morphBuffer.destroy();
    this.morphBuffer = makeStorage(this.device, morphStructBuffer.byteLength, morphStructBuffer);
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.basePositionBuffer } },
        { binding: 2, resource: { buffer: this.deltaBuffer } },
        { binding: 3, resource: { buffer: this.morphBuffer } },
        { binding: 4, resource: { buffer: this.outPositionBuffer } },
      ],
    });
  }

  get outputBuffer(): GPUBuffer {
    return this.outPositionBuffer;
  }
}

function makeStorage(device: GPUDevice, size: number, data?: ArrayBufferView | ArrayBuffer): GPUBuffer {
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const buf = device.createBuffer({ size, usage });
  if (data) device.queue.writeBuffer(buf, 0, data as GPUAllowSharedBufferSource);
  return buf;
}

function makeParams(vertexCount: number, morphCount: number): Uint8Array {
  const view = new Uint32Array(4);
  view[0] = vertexCount;
  view[1] = morphCount;
  return new Uint8Array(view.buffer);
}
