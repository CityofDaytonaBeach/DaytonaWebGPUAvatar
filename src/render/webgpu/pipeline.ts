import { WebGPURenderer, RenderPart } from "./renderer";
import { CharacterGpuState } from "../../gpu/buffers/character-gpu-state";
import { GpuMorphDeform } from "../../gpu/kernels/gpu-morph-deform";
import { SkinningKernel } from "../../gpu/kernels/skinning-kernel";
import { buildInfluences } from "../../gpu/kernels/skin-mesh";
import { combinedSkinMatrices } from "../../anatomy/skeleton/bone-matrix";
import { BoneDef } from "../../anatomy/skeleton/skeleton";
import { packSparseMorphs, setMorphWeights, PackedMorphBuffers } from "../../gpu/morph/gpu-morph-buffers";
import { CanonicalHuman } from "../../geometry/canonical/canonical-human";
import { SparseMorphSet } from "../../geometry/morph/sparse-morph";
import { MorphDriver } from "../../geometry/morph/morph-driver";
import { HumanDefinition } from "../../core/schema/human-definition";
import { BonePose } from "../../animation/skeleton/skeletal-animation";

export interface WebGpuHumanPipelineOptions {
  device: GPUDevice;
  format?: GPUTextureFormat;
  /** Total bytes of the HumanParams uniform buffer (from registry.sizeBytes). */
  paramByteSize: number;
  /** Parametric skeleton (bone order) used for skinning influences/matrices. */
  skeleton?: BoneDef[];
}

/**
 * Ties the GPU-resident character path together for one Human:
 *
 *   CharacterGpuState (base geometry + params)
 *   GpuMorphDeform   (sparse morph GPU-decompress -> deformed positions)
 *   SkinningKernel   (bone skinning -> skinned positions)
 *   WebGPURenderer   (draw the skinned mesh)
 *
 * `render()` must be called inside a command encoding that ends with
 * `device.queue.submit([encoder.finish()])`. `upload()` writes params + morph
 * weights; call it before each render when the definition has changed.
 */
export class WebGpuHumanPipeline {
  readonly state: CharacterGpuState;
  private readonly deform: GpuMorphDeform;
  private readonly skin: SkinningKernel;
  private readonly renderer: WebGPURenderer;
  private readonly packed: PackedMorphBuffers;
  private readonly skeleton: BoneDef[];
  readonly morphNames: string[];

  constructor(
    private readonly canonical: CanonicalHuman,
    private readonly morphs: SparseMorphSet,
    private readonly morphDriver: MorphDriver,
    opts: WebGpuHumanPipelineOptions
  ) {
    const { positions, normals, uvs } = extractGeometry(canonical);
    this.state = new CharacterGpuState(
      opts.device,
      positions,
      normals,
      uvs,
      canonical.indices,
      opts.paramByteSize
    );
    this.packed = packSparseMorphs([...morphs.byName.values()]);
    this.morphNames = this.packed.morphOrder;
    this.deform = new GpuMorphDeform(
      opts.device,
      canonical.vertexCount,
      positions,
      this.packed.deltaPacked,
      this.packed.morphStruct
    );
    const skeleton = opts.skeleton ?? [];
    this.skeleton = skeleton;
    const influences = buildInfluences(canonical, skeleton);
    this.skin = new SkinningKernel(
      opts.device,
      canonical.vertexCount,
      this.deform.outputBuffer,
      influences,
      combinedSkinMatrices(skeleton),
      skeleton.length
    );
    this.renderer = new WebGPURenderer(opts.device, opts.format ?? "bgra8unorm");
    const renderParts = buildRenderParts(opts.device, canonical);
    this.renderer.setParts(renderParts, this.state.paramBuffer);
    this.renderer.setSharedNormalsAndUvs(this.state.normalBuffer, this.state.uvBuffer);
  }

  /**
   * Upload current definition params + morph weights into GPU-resident state.
   * Cheap; call each frame.
   */
  upload(definition: HumanDefinition): void {
    this.state.uploadParameters(definition);
    const weights = new Map<string, number>();
    for (const name of this.morphNames) {
      weights.set(name, this.morphDriver.weight(definition, name));
    }
    const struct = new Uint32Array(this.packed.morphStruct);
    setMorphWeights(struct, this.morphNames, weights);
    this.deform.writeWeights(struct);
  }

  /**
   * Update the GPU skin matrices from a set of bone poses (rotations/offsets
   * relative to rest). Rest pose (no animation) yields identity skin matrices
   * and leaves the mesh unchanged.
   */
  setPose(poses: BonePose[] = []): void {
    this.skin.setBoneMatrices(combinedSkinMatrices(this.skeleton, poses));
  }

  /**
   * Dispatch morph + skinning compute and draw the skinned mesh into `view`.
   * Call `upload()` first (or call `renderAndUpload`).
   */
  render(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    width: number,
    height: number
  ): void {
    this.deform.dispatch(encoder);
    this.skin.dispatch(encoder);
    this.renderer.draw(encoder, view, width, height, this.skin.outputBuffer);
  }

  /** Convenience: upload params/weights, deform, and draw. */
  renderAndUpload(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    width: number,
    height: number,
    definition: HumanDefinition
  ): void {
    this.upload(definition);
    this.render(encoder, view, width, height);
  }
}

function extractGeometry(canonical: CanonicalHuman): {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
} {
  const n = canonical.vertexCount;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const v = canonical.vertices[i];
    positions[i * 3 + 0] = v.position.x;
    positions[i * 3 + 1] = v.position.y;
    positions[i * 3 + 2] = v.position.z;
    normals[i * 3 + 0] = v.normal.x;
    normals[i * 3 + 1] = v.normal.y;
    normals[i * 3 + 2] = v.normal.z;
    uvs[i * 2 + 0] = v.uv.u;
    uvs[i * 2 + 1] = v.uv.v;
  }
  return { positions, normals, uvs };
}

/**
 * Build per-part index buffers + material colors for the whole character.
 * The body is all triangles before the first detail part; each detail part
 * (eye/iris/teeth/tongue/cavity) is its own drawable sub-mesh.
 */
function buildRenderParts(device: GPUDevice, canonical: CanonicalHuman): RenderPart[] {
  const parts: RenderPart[] = [];

  const bodyEnd = canonical.parts.length > 0 ? canonical.parts[0].indexStart : canonical.indices.length;
  const mkIndexBuffer = (start: number, count: number): GPUBuffer => {
    const buf = device.createBuffer({
      size: count * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, canonical.indices.subarray(start, start + count) as unknown as ArrayBuffer);
    return buf;
  };

  // Body (skin) + every detail part in canonical order.
  parts.push({
    name: "body",
    color: [0.72, 0.56, 0.45],
    opaque: true,
    indexBuffer: mkIndexBuffer(0, bodyEnd),
    indexCount: bodyEnd,
  });
  for (const p of canonical.parts) {
    const color = partColor(p.name, p.kind);
    parts.push({
      name: p.name,
      color: color.rgb,
      opaque: color.opaque,
      indexBuffer: mkIndexBuffer(p.indexStart, p.indexCount),
      indexCount: p.indexCount,
    });
  }
  return parts;
}

function partColor(
  name: string,
  kind: string
): { rgb: [number, number, number]; opaque: boolean } {
  if (kind === "sclera") return { rgb: [0.95, 0.95, 0.95], opaque: true };
  if (kind === "iris") {
    // Pupils darker than the iris ring.
    return name.startsWith("pupil")
      ? { rgb: [0.12, 0.1, 0.12], opaque: true }
      : { rgb: [0.35, 0.52, 0.38], opaque: true };
  }
  if (kind === "teeth") return { rgb: [0.93, 0.91, 0.84], opaque: true };
  if (kind === "tongue") return { rgb: [0.82, 0.5, 0.48], opaque: true };
  if (kind === "mouth_cavity") return { rgb: [0.22, 0.10, 0.11], opaque: true };
  return { rgb: [0.72, 0.56, 0.45], opaque: true };
}
