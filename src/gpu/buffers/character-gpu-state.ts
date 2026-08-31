import { HumanDefinition } from "../../core/schema/human-definition";

/**
 * GPU-resident character state manager. Keeps hot character state on the GPU:
 * base vertices, working vertices, normals, parameter buffer. CPU sends small
 * state changes; the GPU computes deformation.
 *
 * v0.1 stores the canonical block human into GPU buffers and updates the
 * parameter buffer from the HumanDefinition.
 */
export class CharacterGpuState {
  readonly paramBuffer: GPUBuffer;
  readonly basePositionBuffer: GPUBuffer;
  readonly normalBuffer: GPUBuffer;
  readonly uvBuffer: GPUBuffer;
  readonly indexBuffer: GPUBuffer;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly paramByteSize: number;

  private paramUpload: Float32Array;

  constructor(
    private device: GPUDevice,
    vertexPositions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array | null,
    indices: Uint32Array,
    paramByteSize: number
  ) {
    this.vertexCount = vertexPositions.length / 3;
    this.indexCount = indices.length;
    this.paramByteSize = paramByteSize;

    this.paramUpload = new Float32Array(paramByteSize / 4);
    this.paramBuffer = device.createBuffer({
      size: paramByteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.basePositionBuffer = createVertexBuffer(device, vertexPositions, "base positions");
    this.normalBuffer = createVertexBuffer(device, normals, "normals");
    this.uvBuffer = createVertexBuffer(device, uvs ?? new Float32Array((vertexPositions.length / 3) * 2), "uvs");
    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    writeBuffer(device, this.indexBuffer, 0, indices);
  }

  /** Upload the current parameter values into the GPU uniform buffer. */
  uploadParameters(definition: HumanDefinition): void {
    definition.writeToBuffer(this.paramUpload);
    writeBuffer(this.device, this.paramBuffer, 0, this.paramUpload);
  }
}

/** Cast standard typed arrays into the WebGPU buffer-source type. */
function writeBuffer(
  device: GPUDevice,
  buffer: GPUBuffer,
  offset: number,
  data: ArrayBufferView | ArrayBuffer
): void {
  device.queue.writeBuffer(buffer, offset, data as GPUAllowSharedBufferSource);
}

function createVertexBuffer(device: GPUDevice, data: Float32Array, label: string): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  writeBuffer(device, buf, 0, data);
  return buf;
}
