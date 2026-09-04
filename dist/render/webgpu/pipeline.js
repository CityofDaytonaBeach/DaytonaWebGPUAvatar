import { WebGPURenderer } from './renderer.js';
import { CharacterGpuState } from '../../gpu/buffers/character-gpu-state.js';
import { GpuMorphDeform } from '../../gpu/kernels/gpu-morph-deform.js';
import { SkinningKernel } from '../../gpu/kernels/skinning-kernel.js';
import { buildInfluences } from '../../gpu/kernels/skin-mesh.js';
import { combinedSkinMatrices } from '../../anatomy/skeleton/bone-matrix.js';
import { packSparseMorphs, setMorphWeights, } from '../../gpu/morph/gpu-morph-buffers.js';
import { bakeCurvatureThickness } from '../photoreal/curvature-bake.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { exportSkinMaterial, SkinPreset } from '../../surface/skin/neural-skin.js';
import { createDefaultRegistry } from '../../core/schema/descriptors.js';
import { PHOTOREAL_HUMAN_WGSL } from '../wgsl/photoreal-wgsl.js';
import { HUMAN_RENDER_WGSL } from './renderer.js';
import { buildPhotorealMaterials } from '../photoreal/photoreal-material.js';
import { PHOTOREAL_FLAGS } from '../photoreal/constants.js';
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
    canonical;
    morphs;
    morphDriver;
    state;
    deform;
    skin;
    renderer;
    packed;
    skeleton;
    skinMaterial;
    /** Active shading model. */
    shading;
    tangentBuffer;
    skinPreset;
    renderParts = [];
    /** Baked [curvature, thickness] vertex buffer, when the bake ran. */
    curvatureThicknessBuffer;
    morphNames;
    constructor(canonical, morphs, morphDriver, opts) {
        this.canonical = canonical;
        this.morphs = morphs;
        this.morphDriver = morphDriver;
        const { positions, normals, uvs } = extractGeometry(canonical);
        this.state = new CharacterGpuState(opts.device, positions, normals, uvs, canonical.indices, opts.paramByteSize);
        this.packed = packSparseMorphs([...morphs.byName.values()]);
        this.morphNames = this.packed.morphOrder;
        this.deform = new GpuMorphDeform(opts.device, canonical.vertexCount, positions, this.packed.deltaPacked, this.packed.morphStruct);
        const skeleton = opts.skeleton ?? [];
        this.skeleton = skeleton;
        const influences = buildInfluences(canonical, skeleton);
        this.skin = new SkinningKernel(opts.device, canonical.vertexCount, this.deform.outputBuffer, influences, combinedSkinMatrices(skeleton), skeleton.length, this.state.normalBuffer);
        const shading = opts.shading ?? 'photoreal';
        this.shading = shading;
        this.renderer = new WebGPURenderer(opts.device, opts.format ?? 'bgra8unorm', shading === 'photoreal' ? PHOTOREAL_HUMAN_WGSL : HUMAN_RENDER_WGSL);
        const preset = opts.skinPreset ?? SkinPreset.Fair;
        this.skinPreset = preset;
        const definition = opts.definition ?? new HumanDefinition(createDefaultRegistry());
        const renderParts = shading === 'photoreal'
            ? buildPhotorealRenderParts(opts.device, canonical, preset, definition)
            : buildRenderParts(opts.device, canonical);
        this.renderParts = renderParts;
        this.renderer.setParts(renderParts, this.state.paramBuffer);
        this.renderer.setSharedNormalsAndUvs(this.state.normalBuffer, this.state.uvBuffer);
        // Per-vertex tangent perturbation (normal map proxy) from the skin material.
        // Zero for non-skin parts via the shared buffer; the body part reads it.
        this.skinMaterial = exportSkinMaterial(definition, canonical, preset);
        this.tangentBuffer = opts.device.createBuffer({
            size: canonical.vertexCount * 2 * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        const tangentData = new Float32Array(canonical.vertexCount * 2);
        for (let i = 0; i < canonical.vertexCount; i++) {
            tangentData[i * 2] = this.skinMaterial.normalPerturbX[i] ?? 0;
            tangentData[i * 2 + 1] = this.skinMaterial.normalPerturbY[i] ?? 0;
        }
        opts.device.queue.writeBuffer(this.tangentBuffer, 0, tangentData);
        this.renderer.setSharedTangentPerturb(this.tangentBuffer);
        // One-time curvature/thickness bake for the photoreal probe-lit skin model.
        if (shading === 'photoreal' && (opts.bakeCurvatureThickness ?? true)) {
            const bake = bakeCurvatureThickness(canonical);
            this.curvatureThicknessBuffer = opts.device.createBuffer({
                size: bake.packed.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            opts.device.queue.writeBuffer(this.curvatureThicknessBuffer, 0, bake.packed);
            this.renderer.setSharedCurvatureThickness(this.curvatureThicknessBuffer);
        }
    }
    /**
     * Re-derive photoreal per-part materials from `definition` and re-bind them.
     * Index buffers are reused, so this is cheap; call it when skin/eye parameters
     * change (not every frame). No-op under `'basic'` shading.
     */
    refreshMaterials(definition) {
        if (this.shading !== 'photoreal')
            return;
        const materials = buildPhotorealMaterials(definition, this.canonical, this.skinPreset);
        this.renderParts = this.renderParts.map((part, i) => materials[i] ? applyPhotorealMaterial(part, materials[i]) : part);
        this.renderer.setParts(this.renderParts, this.state.paramBuffer);
    }
    /**
     * Upload current definition params + morph weights into GPU-resident state.
     * Cheap; call each frame.
     */
    upload(definition) {
        this.state.uploadParameters(definition);
        const weights = new Map();
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
    setPose(poses = []) {
        this.skin.setBoneMatrices(combinedSkinMatrices(this.skeleton, poses));
    }
    /**
     * Dispatch morph + skinning compute and draw the skinned mesh into `view`.
     * Call `upload()` first (or call `renderAndUpload`).
     */
    render(encoder, view, width, height) {
        this.deform.dispatch(encoder);
        this.skin.dispatch(encoder);
        this.renderer.draw(encoder, view, width, height, this.skin.outputBuffer, this.skin.outputNormalsBuffer);
    }
    /** Convenience: upload params/weights, deform, and draw. */
    renderAndUpload(encoder, view, width, height, definition) {
        this.upload(definition);
        this.render(encoder, view, width, height);
    }
}
function extractGeometry(canonical) {
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
function buildRenderParts(device, canonical) {
    const parts = [];
    const bodyEnd = canonical.parts.length > 0 ? canonical.parts[0].indexStart : canonical.indices.length;
    const mkIndexBuffer = (start, count) => {
        const buf = device.createBuffer({
            size: count * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buf, 0, canonical.indices.subarray(start, start + count));
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
/**
 * Photoreal per-part index buffers + materials. Same draw order as
 * `buildRenderParts`, but materials/flags come from `buildPhotorealMaterials`
 * so the shader gets real skin/sclera/iris/cornea/enamel parameters.
 */
function buildPhotorealRenderParts(device, canonical, preset, definition) {
    const materials = buildPhotorealMaterials(definition, canonical, preset);
    const base = buildRenderParts(device, canonical);
    return base.map((part, i) => (materials[i] ? applyPhotorealMaterial(part, materials[i]) : part));
}
/** Overlay one photoreal material onto an existing render part. */
function applyPhotorealMaterial(part, m) {
    return {
        ...part,
        color: m.color,
        material: m.material,
        sssColor: m.sssColor,
        ior: m.ior || undefined,
        refractive: (m.flags & PHOTOREAL_FLAGS.refractive) !== 0,
        extraFlags: m.flags,
        opaque: m.opaque,
    };
}
function partColor(name, kind) {
    if (kind === 'sclera')
        return { rgb: [0.95, 0.95, 0.95], opaque: true };
    if (kind === 'limbus')
        return { rgb: [0.3, 0.34, 0.32], opaque: true };
    if (kind === 'cornea')
        return { rgb: [0.55, 0.6, 0.62], opaque: false };
    if (kind === 'iris') {
        // Pupils darker than the iris ring.
        return name.startsWith('pupil')
            ? { rgb: [0.12, 0.1, 0.12], opaque: true }
            : { rgb: [0.35, 0.52, 0.38], opaque: true };
    }
    if (kind === 'teeth')
        return { rgb: [0.93, 0.91, 0.84], opaque: true };
    if (kind === 'tongue')
        return { rgb: [0.82, 0.5, 0.48], opaque: true };
    if (kind === 'mouth_cavity')
        return { rgb: [0.22, 0.1, 0.11], opaque: true };
    return { rgb: [0.72, 0.56, 0.45], opaque: true };
}
//# sourceMappingURL=pipeline.js.map