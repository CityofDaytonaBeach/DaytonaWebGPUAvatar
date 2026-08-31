import { HUMAN_PARAM_STRUCT } from "../wgsl/shaders";

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
};

struct VSIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
};
struct VSOut {
  @builtin(position) clip_position : vec4f,
  @location(0) normal : vec3f,
  @location(1) uv : vec2f,
};

@group(0) @binding(0) var<uniform> params : HumanParams;
@group(0) @binding(1) var<uniform> camera : Camera;
@group(0) @binding(2) var<uniform> part  : PartParams;

@vertex
fn vs_main(in : VSIn) -> VSOut {
  var out : VSOut;
  out.clip_position = camera.mvp * vec4f(in.position, 1.0);
  out.normal = normalize(camera.normalMat * in.normal);
  out.uv = in.uv;
  return out;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4f {
  let albedo = part.baseColor.rgb;
  let lightDir = normalize(vec3f(0.35, -0.7, 0.5));
  let ndl = max(dot(normalize(in.normal), lightDir), 0.0);
  let shade = albedo * (0.34 + 0.66 * ndl);
  return vec4f(shade, part.baseColor.a);
}
`;

export interface CameraMatrices {
  mvp: Float32Array;
  normalMat: Float32Array;
}

/** One drawable sub-mesh of the canonical human, with its material color. */
export interface RenderPart {
  name: string;
  color: [number, number, number];
  opaque: boolean;
  /** GPU index buffer for this part's triangles. */
  indexBuffer: GPUBuffer;
  indexCount: number;
}

/**
 * Build a perspective MVP + normal matrix for the block human (fits in unit
 * space roughly -1..4 on Y). `angleY` rotates around Y, `angleX` tilts around X.
 */
export function buildCameraMatrices(
  width: number,
  height: number,
  angleY = 0.5,
  angleX = -0.15
): CameraMatrices {
  const aspect = width / height;
  const fov = Math.PI / 3;
  const near = 0.1;
  const far = 100;
  const t = 1 / Math.tan(fov / 2);
  const proj = new Float32Array(16);
  proj[0] = t / aspect; proj[5] = t; proj[10] = far / (near - far); proj[11] = -1;
  proj[14] = (far * near) / (near - far);

  const cy = Math.cos(angleY), sy = Math.sin(angleY);
  const cx = Math.cos(angleX), sx = Math.sin(angleX);
  const view = new Float32Array(16);
  view[0] = cy; view[2] = -sy;
  view[5] = 1;
  view[8] = sy; view[10] = cy;
  const translate = new Float32Array(16);
  translate[0] = 1; translate[5] = 1; translate[10] = 1; translate[14] = -4.2;
  const vt = multiplyMat4(view, translate);
  const tilt = new Float32Array(16);
  tilt[0] = 1; tilt[10] = cx; tilt[6] = sx; tilt[9] = -sx; tilt[5] = 1; tilt[15] = 1;
  const viewFinal = multiplyMat4(tilt, vt);

  const mvp = multiplyMat4(proj, viewFinal);

  const rot = new Float32Array(9);
  rot[0] = viewFinal[0]; rot[1] = viewFinal[1]; rot[2] = viewFinal[2];
  rot[3] = viewFinal[4]; rot[4] = viewFinal[5]; rot[5] = viewFinal[6];
  rot[6] = viewFinal[8]; rot[7] = viewFinal[9]; rot[8] = viewFinal[10];

  return { mvp, normalMat: rot };
}

function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
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
  private pipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private cameraBuffer!: GPUBuffer;
  private normalBuffer!: GPUBuffer;
  private uvBuffer!: GPUBuffer;
  private parts: RenderPart[] = [];
  /** Per-part bind groups (params + camera + part color). */
  private partBindGroups: GPUBindGroup[] = [];
  partNames: string[] = [];

  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat = "bgra8unorm"
  ) {
    this.init(format);
  }

  private init(format: GPUTextureFormat): void {
    const module = this.device.createShaderModule({ code: HUMAN_RENDER_WGSL, label: "human-render" });
    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [
          { arrayStride: 3 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          { arrayStride: 3 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
          { arrayStride: 2 * 4, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
    });
    this.cameraBuffer = this.device.createBuffer({
      size: 112, // mat4 (64) + mat3 (48)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /** Attach static per-part geometry; builds a part-color buffer + bind group. */
  setParts(parts: RenderPart[], paramBuffer: GPUBuffer): void {
    this.parts = parts;
    this.partNames = parts.map((p) => p.name);
    this.partBindGroups = parts.map((p) => {
      const colorBuffer = this.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(
        colorBuffer,
        0,
        new Float32Array([p.color[0], p.color[1], p.color[2], p.opaque ? 1 : 1]) as unknown as ArrayBuffer
      );
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

  /** Attach shared per-vertex normal + UV buffers (whole character). */
  setSharedNormalsAndUvs(normalBuffer: GPUBuffer, uvBuffer: GPUBuffer): void {
    this.normalBuffer = normalBuffer;
    this.uvBuffer = uvBuffer;
  }

  uploadCamera(width: number, height: number): void {
    const { mvp, normalMat } = buildCameraMatrices(width, height);
    const data = new Float32Array(28);
    data.set(mvp, 0);
    data.set(normalMat, 16);
    this.device.queue.writeBuffer(this.cameraBuffer, 0, data as unknown as ArrayBuffer);
  }

  /**
   * Draw all parts using `deformedBuffer` (positions) and `normalsBuffer`
   * (skinned normals) as vertex attributes 0 and 1.
   */
  draw(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    width: number,
    height: number,
    deformedBuffer: GPUBuffer,
    normalsBuffer?: GPUBuffer
  ): void {
    this.uploadCamera(width, height);
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0.07, g: 0.09, b: 0.12, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, deformedBuffer);
    pass.setVertexBuffer(1, normalsBuffer ?? this.normalBuffer);
    pass.setVertexBuffer(2, this.uvBuffer);
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      pass.setBindGroup(0, this.partBindGroups[i]);
      pass.setIndexBuffer(p.indexBuffer, "uint32");
      pass.drawIndexed(p.indexCount);
    }
    pass.end();
  }
}
