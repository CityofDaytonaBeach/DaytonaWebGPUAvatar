import { WebGPURenderer, RenderPart } from './renderer.js';
import { CharacterGpuState } from '../../gpu/buffers/character-gpu-state.js';
import { GpuMorphDeform } from '../../gpu/kernels/gpu-morph-deform.js';
import { SkinningKernel } from '../../gpu/kernels/skinning-kernel.js';
import { buildInfluences } from '../../gpu/kernels/skin-mesh.js';
import { combinedSkinMatrices } from '../../anatomy/skeleton/bone-matrix.js';
import { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import {
  packSparseMorphs,
  setMorphWeights,
  PackedMorphBuffers,
} from '../../gpu/morph/gpu-morph-buffers.js';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { SparseMorphSet } from '../../geometry/morph/sparse-morph.js';
import { MorphDriver } from '../../geometry/morph/morph-driver.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { BonePose } from '../../animation/skeleton/skeletal-animation.js';
import { exportSkinMaterial, SkinPreset } from '../../surface/skin/neural-skin.js';
import { createDefaultRegistry } from '../../core/schema/descriptors.js';

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
  private skinMaterial!: ReturnType<typeof exportSkinMaterial>;
  private tangentBuffer!: GPUBuffer;
  readonly morphNames: string[];

  constructor(
    private readonly canonical: CanonicalHuman,
    private readonly morphs: SparseMorphSet,
    private readonly morphDriver: MorphDriver,
    opts: WebGpuHumanPipelineOptions,
  ) {
    const { positions, normals, uvs } = extractGeometry(canonical);
    this.state = new CharacterGpuState(
      opts.device,
      positions,
      normals,
      uvs,
      canonical.indices,
      opts.paramByteSize,
    );
    this.packed = packSparseMorphs([...morphs.byName.values()]);
    this.morphNames = this.packed.morphOrder;
    this.deform = new GpuMorphDeform(
      opts.device,
      canonical.vertexCount,
      positions,
      this.packed.deltaPacked,
      this.packed.morphStruct,
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
      skeleton.length,
      this.state.normalBuffer,
    );
    this.renderer = new WebGPURenderer(opts.device, opts.format ?? 'bgra8unorm');
    const renderParts = buildRenderParts(opts.device, canonical);
    this.renderer.setParts(renderParts, this.state.paramBuffer);
    this.renderer.setSharedNormalsAndUvs(this.state.normalBuffer, this.state.uvBuffer);

    // Per-vertex tangent perturbation (normal map proxy) from the skin material.
    // Zero for non-skin parts via the shared buffer; the body part reads it.
    this.skinMaterial = exportSkinMaterial(
      new HumanDefinition(createDefaultRegistry()),
      canonical,
      SkinPreset.Fair,
    );
    this.tangentBuffer = opts.device.createBuffer({
      size: canonical.vertexCount * 2 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const tangentData = new Float32Array(canonical.vertexCount * 2);
    for (let i = 0; i < canonical.vertexCount; i++) {
      tangentData[i * 2] = this.skinMaterial.normalPerturbX[i] ?? 0;
      tangentData[i * 2 + 1] = this.skinMaterial.normalPerturbY[i] ?? 0;
    }
    opts.device.queue.writeBuffer(
      this.tangentBuffer,
      0,
      tangentData as unknown as ArrayBuffer,
    );
    this.renderer.setSharedTangentPerturb(this.tangentBuffer);
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
  render(encoder: GPUCommandEncoder, view: GPUTextureView, width: number, height: number): void {
    this.deform.dispatch(encoder);
    this.skin.dispatch(encoder);
    this.renderer.draw(
      encoder,
      view,
      width,
      height,
      this.skin.outputBuffer,
      this.skin.outputNormalsBuffer,
    );
  }

  /** Convenience: upload params/weights, deform, and draw. */
  renderAndUpload(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    width: number,
    height: number,
    definition: HumanDefinition,
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

  const bodyEnd =
    canonical.parts.length > 0 ? canonical.parts[0].indexStart : canonical.indices.length;
  const mkIndexBuffer = (start: number, count: number): GPUBuffer => {
    const buf = device.createBuffer({
      size: count * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      buf,
      0,
      canonical.indices.subarray(start, start + count) as unknown as ArrayBuffer,
    );
    return buf;
  };

  // Body (skin) + every detail part in canonical order. The body uses a
  // realistic PBR skin material (roughness/specular/SSS) and exposes per-vertex
  // tangent perturbations (normal map proxy) for pore/wrinkle detail.
  parts.push({
    name: 'body',
    color: [0.72, 0.56, 0.45],
    material: [0.4, 0.4, 0.4],
    sssColor: [0.9, 0.58, 0.48],
    hasNormalMap: true,
    opaque: true,
    indexBuffer: mkIndexBuffer(0, bodyEnd),
    indexCount: bodyEnd,
  });
  for (const p of canonical.parts) {
    const color = partColor(p.name, p.kind);
    const isCornea = p.kind === 'cornea';
    parts.push({
      name: p.name,
      color: color.rgb,
      material: isCornea ? [0.06, 1.0, 0.0] : undefined,
      sssColor: isCornea ? [0.35, 0.4, 0.45] : undefined,
      refractive: isCornea,
      ior: isCornea ? 1.376 : undefined,
      opaque: color.opaque,
      indexBuffer: mkIndexBuffer(p.indexStart, p.indexCount),
      indexCount: p.indexCount,
    });
  }
  return parts;
}

function partColor(name: string, kind: string): { rgb: [number, number, number]; opaque: boolean } {
  if (kind === 'sclera') return { rgb: [0.95, 0.95, 0.95], opaque: true };
  if (kind === 'limbus') return { rgb: [0.3, 0.34, 0.32], opaque: true };
  if (kind === 'cornea') return { rgb: [0.55, 0.6, 0.62], opaque: false };
  if (kind === 'iris') {
    // Pupils darker than the iris ring.
    return name.startsWith('pupil')
      ? { rgb: [0.12, 0.1, 0.12], opaque: true }
      : { rgb: [0.35, 0.52, 0.38], opaque: true };
  }
  if (kind === 'teeth') return { rgb: [0.93, 0.91, 0.84], opaque: true };
  if (kind === 'tongue') return { rgb: [0.82, 0.5, 0.48], opaque: true };
  if (kind === 'mouth_cavity') return { rgb: [0.22, 0.1, 0.11], opaque: true };
  return { rgb: [0.72, 0.56, 0.45], opaque: true };
}
