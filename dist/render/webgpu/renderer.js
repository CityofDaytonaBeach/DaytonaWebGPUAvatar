import { HUMAN_PARAM_STRUCT } from '../wgsl/shaders.js';
/**
 * Full WGSL program for the human renderer (single module so vertex/fragment
 * share the VSOut type). Reads deformed working positions from the morph
 * compute output, applies a model-view-projection matrix, and shades each
 * rendered part (skin / sclera / iris / teeth / tongue / cavity) with its own
 * base color driven by a per-part uniform.
 */
export const HUMAN_RENDER_WGSL = `
${HUMAN_PARAM_STRUCT}

struct Camera {
  mvp : mat4x4f,
  normalMat : mat3x3f,
};

struct PartParams {
  baseColor : vec4f,
  material : vec4f,   // rgb = roughness, specular, sssIntensity ; a = IOR
  sssColor : vec4f,   // rgb = subsurface scatter color ; a = unused
  flags : u32,        // bit0: hasTangentPerturb ; bit1: refractive(cornea)
};

struct VSIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
  @location(3) tangentPerturb : vec2f,   // optional normal-map pixels per vertex
};
struct VSOut {
  @builtin(position) clip_position : vec4f,
  @location(0) world_normal : vec3f,
  @location(1) uv : vec2f,
  @location(2) tangent_perturb : vec2f,
  @location(3) part_flags : u32,
};

@group(0) @binding(0) var<uniform> params : HumanParams;
@group(0) @binding(1) var<uniform> camera : Camera;
@group(0) @binding(2) var<uniform> part  : PartParams;

@vertex
fn vs_main(in : VSIn) -> VSOut {
  var out : VSOut;
  out.clip_position = camera.mvp * vec4f(in.position, 1.0);
  out.world_normal = normalize(camera.normalMat * in.normal);
  out.uv = in.uv;
  out.tangent_perturb = in.tangentPerturb;
  out.part_flags = part.flags;
  return out;
}

fn reconstructNormal(perturb : vec2f, n : vec3f) -> vec3f {
  let z = sqrt(max(1.0 - dot(perturb, perturb), 0.0));
  // World-space tangent-frame approximation from the geometric normal.
  let t = normalize(cross(vec3f(0.0, 1.0, 0.0), n));
  let b = cross(n, t);
  let nn = t * perturb.x + b * perturb.y + n * z;
  return normalize(nn);
}

fn fresnelSchlick(cosT : f32, f0 : vec3f) -> vec3f {
  return f0 + (1.0 - f0) * pow(1.0 - cosT, 5.0);
}

fn distributionGGX(ndh : f32, roughness : f32) -> f32 {
  let r2 = roughness * roughness;
  let d = (ndh * ndh) * (r2 - 1.0) + 1.0;
  return r2 / (3.14159265 * d * d);
}

fn geometrySchlickGGX(ndv : f32, roughness : f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return ndv / (ndv * (1.0 - k) + k);
}

fn geometrySmith(ndv : f32, ndl : f32, roughness : f32) -> f32 {
  return geometrySchlickGGX(ndv, roughness) * geometrySchlickGGX(ndl, roughness);
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4f {
  let albedo = part.baseColor.rgb;
  let roughness = part.material.r;
  let specular = part.material.g;
  let sssIntensity = part.material.b;
  let ior = part.material.a;

  var nrm = normalize(in.world_normal);
  if ((in.part_flags & 1u) != 0u) {
    nrm = reconstructNormal(in.tangent_perturb, nrm);
  }

  let lightDir = normalize(vec3f(0.35, -0.7, 0.5));
  let viewDir = normalize(vec3f(0.0, 0.0, 1.0));
  let halfDir = normalize(lightDir + viewDir);

  let ndl = max(dot(nrm, lightDir), 0.0);
  let ndv = max(dot(nrm, viewDir), 0.0);
  let ndh = max(dot(nrm, halfDir), 0.0);

  // Diffuse (Lambert)
  let kD = vec3f(1.0);

  // Specular (Cook-Torrance)
  let f0 = mix(vec3f(0.04), albedo, specular);
  let F = fresnelSchlick(ndv, f0);
  let D = distributionGGX(ndh, roughness);
  let G = geometrySmith(ndv, ndl, roughness);
  let spec = (D * G * F) / (4.0 * ndv * ndl + 1e-4);

  // Subsurface scattering approximation
  let wrap = max(dot(nrm, lightDir) * 0.5 + 0.5, 0.0);
  let sssTerm = mix(albedo, part.sssColor.rgb, wrap * sssIntensity * 0.5);

  var color = (kD * (1.0 - F)) * sssTerm + spec;

  // Corneal refraction (IOR-based optics). For the transparent cornea dome we
  // approximate transmitted light by refracting the view ray through the dome
  // and tinting toward the iris that sits behind it, blended by Fresnel (more
  // reflection at grazing angles). This models refraction + corneal specular
  // without a full scene-depth pass.
  if ((in.part_flags & 2u) != 0u) {
    let eta = 1.0 / max(ior, 1.0001);
    let incident = -viewDir;
    let cosI = clamp(dot(incident, nrm), -1.0, 1.0);
    let k = 1.0 - eta * eta * (1.0 - cosI * cosI);
    var refrDir = incident;
    if (k >= 0.0) {
      refrDir = eta * incident + (eta * cosI - sqrt(k)) * nrm;
    }
    refrDir = normalize(refrDir);
    // Approximate the iris/sclera behind the dome: use the base brightness
    // modulated by the refracted normal-vs-light term.
    let behindIris = albedo * (0.5 + 0.5 * max(dot(refrDir, lightDir), 0.0));
    // Fresnel reflection of the dome surface.
    let domeF = fresnelSchlick(ndv, vec3f(0.04));
    // Blend transmitted (refracted iris) with dome reflection + specular.
    color = mix(behindIris * (1.0 - domeF), albedo * 0.9, domeF * 0.6) + spec * 1.5;
  }

  let shade = color * (0.3 + 0.7 * ndl);

  return vec4f(shade, part.baseColor.a);
}
`;
/**
 * Build a perspective MVP + normal matrix for the block human (fits in unit
 * space roughly -1..4 on Y). `angleY` rotates around Y, `angleX` tilts around X.
 */
/** Vertical half-FOV tangent of `buildCameraMatrices` (fov = PI/3). */
export const CAMERA_TAN_HALF_FOV = Math.tan(Math.PI / 6);
export function buildCameraMatrices(width, height, angleY = 0.5, angleX = -0.15) {
    const aspect = width / height;
    const fov = Math.PI / 3;
    const near = 0.1;
    const far = 100;
    const t = 1 / Math.tan(fov / 2);
    const proj = new Float32Array(16);
    proj[0] = t / aspect;
    proj[5] = t;
    proj[10] = far / (near - far);
    proj[11] = -1;
    proj[14] = (far * near) / (near - far);
    const cy = Math.cos(angleY), sy = Math.sin(angleY);
    const cx = Math.cos(angleX), sx = Math.sin(angleX);
    const view = new Float32Array(16);
    view[0] = cy;
    view[2] = -sy;
    view[5] = 1;
    view[8] = sy;
    view[10] = cy;
    const translate = new Float32Array(16);
    translate[0] = 1;
    translate[5] = 1;
    translate[10] = 1;
    translate[14] = -4.2;
    const vt = multiplyMat4(view, translate);
    const tilt = new Float32Array(16);
    tilt[0] = 1;
    tilt[10] = cx;
    tilt[6] = sx;
    tilt[9] = -sx;
    tilt[5] = 1;
    tilt[15] = 1;
    const viewFinal = multiplyMat4(tilt, vt);
    const mvp = multiplyMat4(proj, viewFinal);
    const rot = new Float32Array(9);
    rot[0] = viewFinal[0];
    rot[1] = viewFinal[1];
    rot[2] = viewFinal[2];
    rot[3] = viewFinal[4];
    rot[4] = viewFinal[5];
    rot[5] = viewFinal[6];
    rot[6] = viewFinal[8];
    rot[7] = viewFinal[9];
    rot[8] = viewFinal[10];
    return { mvp, normalMat: rot };
}
function multiplyMat4(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            out[c * 4 + r] =
                a[0 * 4 + r] * b[c * 4 + 0] +
                    a[1 * 4 + r] * b[c * 4 + 1] +
                    a[2 * 4 + r] * b[c * 4 + 2] +
                    a[3 * 4 + r] * b[c * 4 + 3];
        }
    }
    return out;
}
/**
 * WebGPU human renderer. Draws the GPU-resident, GPU-deformed character as a
 * set of parts (skin + eyes + teeth + tongue + cavity), each with its own
 * material color from a per-part uniform. Morph output (deformed positions) is
 * bound as the vertex position attribute so deformation is visibly applied.
 */
export class WebGPURenderer {
    device;
    shaderCode;
    colorFormats;
    pipeline;
    bindGroupLayout;
    cameraBuffer;
    normalBuffer;
    uvBuffer;
    tangentBuffer;
    /** Optional baked [curvature, thickness] per vertex (photoreal shading only). */
    curvatureThicknessBuffer;
    /** Zero-filled stand-in so the attribute is always bound; zero = "not baked". */
    curvatureThicknessFallback;
    /** True when the bound shader declares the location-4 bake attribute. */
    usesCurvatureThickness;
    parts = [];
    /** Per-part bind groups (params + camera + part color). */
    partBindGroups = [];
    partNames = [];
    constructor(device, format = 'bgra8unorm', 
    /**
     * Shader program to render with. Defaults to the built-in program; pass
     * `PHOTOREAL_HUMAN_WGSL` for the photoreal skin/eye/enamel model. The bind
     * group and vertex layouts are identical, so this is a pure module swap.
     */
    shaderCode = HUMAN_RENDER_WGSL, 
    /**
     * Fragment color target formats. Defaults to the single swap-chain target;
     * the screen-space SSS graph passes its G-buffer formats (radiance, view
     * depth, skin mask) together with the G-buffer shader variant.
     */
    colorFormats = []) {
        this.device = device;
        this.shaderCode = shaderCode;
        this.colorFormats = colorFormats;
        // The photoreal module reads baked curvature/thickness at location 4; the
        // basic module does not, so the extra vertex buffer is added only for it.
        this.usesCurvatureThickness = shaderCode.includes('curvatureThickness');
        this.init(format);
    }
    init(format) {
        const module = this.device.createShaderModule({
            code: this.shaderCode,
            label: 'human-render',
        });
        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                },
                { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                {
                    binding: 2,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                },
            ],
        });
        this.pipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            vertex: {
                module,
                entryPoint: 'vs_main',
                buffers: [
                    {
                        arrayStride: 3 * 4,
                        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
                    },
                    {
                        arrayStride: 3 * 4,
                        attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }],
                    },
                    {
                        arrayStride: 2 * 4,
                        attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }],
                    },
                    {
                        arrayStride: 2 * 4,
                        attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }],
                    },
                    ...(this.usesCurvatureThickness
                        ? [
                            {
                                arrayStride: 2 * 4,
                                attributes: [
                                    { shaderLocation: 4, offset: 0, format: 'float32x2' },
                                ],
                            },
                        ]
                        : []),
                ],
            },
            fragment: {
                module,
                entryPoint: 'fs_main',
                targets: (this.colorFormats.length > 0 ? this.colorFormats : [format]).map((f) => ({
                    format: f,
                })),
            },
            primitive: { topology: 'triangle-list', cullMode: 'back' },
        });
        this.cameraBuffer = this.device.createBuffer({
            size: 112, // mat4 (64) + mat3 (48)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }
    /** Attach static per-part geometry; builds a part-color buffer + bind group. */
    setParts(parts, paramBuffer) {
        this.parts = parts;
        this.partNames = parts.map((p) => p.name);
        this.partBindGroups = parts.map((p) => {
            // PartParams = baseColor(vec4) + material(vec4) + sssColor(vec4) + flags(u32)
            // WGSL struct is 64 bytes (flags at 48, struct padded to 16-byte align).
            const buf = new ArrayBuffer(64);
            const view = new DataView(buf);
            const mat = p.material ?? [0.5, 0.4, 0.3];
            const sss = p.sssColor ?? [0.9, 0.6, 0.5];
            let flags = p.hasNormalMap ? 1 : 0;
            if (p.refractive)
                flags |= 2;
            if (p.extraFlags)
                flags |= p.extraFlags;
            const ior = p.ior ?? 0;
            const f32 = new Float32Array(buf);
            f32[0] = p.color[0];
            f32[1] = p.color[1];
            f32[2] = p.color[2];
            f32[3] = p.opaque ? 1 : 1;
            f32[4] = mat[0];
            f32[5] = mat[1];
            f32[6] = mat[2];
            f32[7] = ior;
            f32[8] = sss[0];
            f32[9] = sss[1];
            f32[10] = sss[2];
            f32[11] = 0;
            view.setUint32(48, flags, true);
            const colorBuffer = this.device.createBuffer({
                size: 64,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(colorBuffer, 0, buf);
            return this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: paramBuffer } },
                    { binding: 1, resource: { buffer: this.cameraBuffer } },
                    { binding: 2, resource: { buffer: colorBuffer } },
                ],
            });
        });
    }
    /** Attach shared per-vertex normal, UV, and optional tangent-perturb buffers. */
    setSharedNormalsAndUvs(normalBuffer, uvBuffer) {
        this.normalBuffer = normalBuffer;
        this.uvBuffer = uvBuffer;
    }
    /**
     * Attach the shared per-vertex tangent perturbation buffer (stride 2 floats).
     * Parts marked hasNormalMap read it; all others ignore it.
     */
    setSharedTangentPerturb(tangentBuffer) {
        this.tangentBuffer = tangentBuffer;
    }
    /**
     * Attach the shared per-vertex baked [curvature, thickness] buffer (stride 2
     * floats), produced by `bakeCurvatureThickness()`. Ignored by the basic
     * shading model; when absent the photoreal shader falls back to its head-wide
     * constants.
     */
    setSharedCurvatureThickness(buffer) {
        this.curvatureThicknessBuffer = buffer;
    }
    /** Lazily created zero buffer used when no bake has been attached. */
    curvatureThicknessOrFallback(vertexCount) {
        if (this.curvatureThicknessBuffer)
            return this.curvatureThicknessBuffer;
        if (!this.curvatureThicknessFallback) {
            this.curvatureThicknessFallback = this.device.createBuffer({
                size: Math.max(vertexCount, 1) * 2 * 4,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }
        return this.curvatureThicknessFallback;
    }
    uploadCamera(width, height) {
        const { mvp, normalMat } = buildCameraMatrices(width, height);
        const data = new Float32Array(28);
        data.set(mvp, 0);
        data.set(normalMat, 16);
        this.device.queue.writeBuffer(this.cameraBuffer, 0, data);
    }
    /**
     * Draw all parts using `deformedBuffer` (positions) and `normalsBuffer`
     * (skinned normals) as vertex attributes 0 and 1.
     */
    draw(encoder, view, width, height, deformedBuffer, normalsBuffer) {
        this.drawToAttachments(encoder, [
            {
                view,
                clearValue: { r: 0.07, g: 0.09, b: 0.12, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
            },
        ], width, height, deformedBuffer, normalsBuffer);
    }
    /**
     * Same draw, into caller-supplied color attachments. Used by the screen-space
     * SSS graph, whose forward pass writes radiance + view depth + skin mask.
     */
    drawToAttachments(encoder, colorAttachments, width, height, deformedBuffer, normalsBuffer) {
        this.uploadCamera(width, height);
        const pass = encoder.beginRenderPass({ colorAttachments });
        pass.setPipeline(this.pipeline);
        pass.setVertexBuffer(0, deformedBuffer);
        pass.setVertexBuffer(1, normalsBuffer ?? this.normalBuffer);
        pass.setVertexBuffer(2, this.uvBuffer);
        pass.setVertexBuffer(3, this.tangentBuffer);
        if (this.usesCurvatureThickness) {
            const vertexCount = deformedBuffer.size / (3 * 4);
            pass.setVertexBuffer(4, this.curvatureThicknessOrFallback(vertexCount));
        }
        for (let i = 0; i < this.parts.length; i++) {
            const p = this.parts[i];
            pass.setBindGroup(0, this.partBindGroups[i]);
            pass.setIndexBuffer(p.indexBuffer, 'uint32');
            pass.drawIndexed(p.indexCount);
        }
        pass.end();
    }
}
//# sourceMappingURL=renderer.js.map