import { SKIN_COMPUTE_WGSL } from '../../render/wgsl/skin-wgsl';
import { SkinInfluences } from './skin-mesh';

/**
 * Dispatches the GPU skinning compute pass. Reads GPU-resident positions (the
 * morph-deformed working buffer), per-vertex bone influences, and a skin matrix
 * buffer; writes skinned positions a renderer can bind. At the rest pose the
 * skin matrices are identity, so output equals input — animation alone moves
 * the vertices bound to rotated bones.
 */
export class SkinningKernel {
  private readonly device: GPUDevice;

  private paramsBuffer: GPUBuffer;
  private inBuffer: GPUBuffer;
  private indicesBuffer: GPUBuffer;
  private weightsBuffer: GPUBuffer;
  private matricesBuffer: GPUBuffer;
  private outBuffer: GPUBuffer;
  private inNormalBuffer: GPUBuffer;
  private outNormalBuffer: GPUBuffer;

  private pipeline: GPUComputePipeline;
  private bindGroup: GPUBindGroup;
  private vertexCount: number;

  constructor(
    device: GPUDevice,
    vertexCount: number,
    inputPositions: GPUBuffer,
    influences: SkinInfluences,
    boneMatrices: Float32Array,
    numBones: number,
    inputNormals: GPUBuffer,
  ) {
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

  private bind(): GPUBindGroup {
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
  dispatch(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.vertexCount / 64));
    pass.end();
  }

  /** Upload a new set of combined skin matrices (animation update). */
  setBoneMatrices(boneMatrices: Float32Array): void {
    this.matricesBuffer.destroy();
    this.matricesBuffer = makeStorage(this.device, boneMatrices.byteLength, boneMatrices);
    this.bindGroup = this.bind();
  }

  get outputBuffer(): GPUBuffer {
    return this.outBuffer;
  }

  get outputNormalsBuffer(): GPUBuffer {
    return this.outNormalBuffer;
  }
}

function makeStorage(
  device: GPUDevice,
  size: number,
  data?: ArrayBufferView | ArrayBuffer,
): GPUBuffer {
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const buf = device.createBuffer({ size, usage });
  if (data) device.queue.writeBuffer(buf, 0, data as GPUAllowSharedBufferSource);
  return buf;
}

function makeParams(vertexCount: number, boneCount: number): Uint8Array {
  const view = new Uint32Array(4);
  view[0] = vertexCount;
  view[1] = boneCount;
  return new Uint8Array(view.buffer);
}
