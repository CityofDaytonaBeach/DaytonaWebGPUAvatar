/**
 * Live screen-space subsurface-scattering render graph.
 *
 * The forward photoreal pass writes three targets (linear radiance, view depth,
 * skin mask) instead of one; this graph then runs the separable blur from
 * `photoreal/sss-blur.ts` horizontally into an intermediate target and
 * vertically into the swap-chain view, applying the display transform on the
 * final pass. Non-skin pixels (mask 0) pass through unchanged, so eyes, teeth
 * and mouth cavity keep their crisp shading.
 *
 * Everything here is device-side plumbing; the kernel, step scaling and depth
 * rejection all live in the CPU-referenced module and are asserted by its tests.
 */

import { SSS_BLUR_WGSL, SSS_COMPOSITE_WGSL, sssParamsData } from '../photoreal/sss-blur.js';

/** Color target formats of the photoreal G-buffer pass, in shader-location order. */
export const SSS_GBUFFER_FORMATS: readonly GPUTextureFormat[] = [
  'rgba16float', // linear radiance
  'r32float', // view depth, metres
  'r8unorm', // skin mask
];

/** Intermediate target of the horizontal pass (stays in linear light). */
export const SSS_INTERMEDIATE_FORMAT: GPUTextureFormat = 'rgba16float';

/** Clear color of the radiance target — matches the previous single-pass clear. */
export const SSS_CLEAR_COLOR: GPUColorDict = { r: 0.07, g: 0.09, b: 0.12, a: 1 };

/** Blur direction of each pass, in UV space. */
export const SSS_PASS_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
];

interface Targets {
  width: number;
  height: number;
  lit: GPUTexture;
  depth: GPUTexture;
  mask: GPUTexture;
  ping: GPUTexture;
}

export class SssRenderGraph {
  private targets?: Targets;
  private readonly blurPipeline: GPURenderPipeline;
  private readonly compositePipeline: GPURenderPipeline;
  private readonly layout: GPUBindGroupLayout;
  private readonly sampler: GPUSampler;
  /** One uniform buffer per pass so both passes can be encoded back to back. */
  private readonly paramBuffers: GPUBuffer[];

  constructor(
    private readonly device: GPUDevice,
    /** Swap-chain format the composite pass writes. */
    private readonly outputFormat: GPUTextureFormat,
    /** tan(halfFov) of the active projection; scales the blur to world width. */
    private readonly tanHalfFov: number,
  ) {
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'unfilterable-float' },
        },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    const mk = (code: string, format: GPUTextureFormat, label: string): GPURenderPipeline => {
      const module = device.createShaderModule({ code, label });
      return device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
    };
    this.blurPipeline = mk(SSS_BLUR_WGSL, SSS_INTERMEDIATE_FORMAT, 'sss-blur-h');
    this.compositePipeline = mk(SSS_COMPOSITE_WGSL, outputFormat, 'sss-composite-v');
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.paramBuffers = SSS_PASS_DIRECTIONS.map(() =>
      device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    );
  }

  /** (Re)allocate the G-buffer + intermediate targets for this viewport size. */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.targets && this.targets.width === w && this.targets.height === h) return;
    this.destroyTargets();
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    const tex = (format: GPUTextureFormat, label: string): GPUTexture =>
      this.device.createTexture({ size: { width: w, height: h }, format, usage, label });
    this.targets = {
      width: w,
      height: h,
      lit: tex(SSS_GBUFFER_FORMATS[0], 'sss-lit'),
      depth: tex(SSS_GBUFFER_FORMATS[1], 'sss-depth'),
      mask: tex(SSS_GBUFFER_FORMATS[2], 'sss-mask'),
      ping: tex(SSS_INTERMEDIATE_FORMAT, 'sss-ping'),
    };
  }

  /**
   * Color attachments for the forward G-buffer pass, in shader-location order.
   * `resize()` must have run for the current viewport.
   */
  geometryAttachments(): GPURenderPassColorAttachment[] {
    const t = this.requireTargets();
    return [
      {
        view: t.lit.createView(),
        clearValue: SSS_CLEAR_COLOR,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
      {
        // Far depth: an unwritten pixel must never pull skin toward it.
        view: t.depth.createView(),
        clearValue: { r: 1e4, g: 0, b: 0, a: 1 },
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
      {
        view: t.mask.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
    ];
  }

  /** Encode both blur passes; the vertical pass writes `outputView`. */
  run(encoder: GPUCommandEncoder, outputView: GPUTextureView): void {
    const t = this.requireTargets();
    const viewportPixels = Math.max(t.width, t.height);
    const passes: { source: GPUTexture; dest: GPUTextureView; pipeline: GPURenderPipeline }[] = [
      { source: t.lit, dest: t.ping.createView(), pipeline: this.blurPipeline },
      { source: t.ping, dest: outputView, pipeline: this.compositePipeline },
    ];
    for (let i = 0; i < passes.length; i++) {
      const { source, dest, pipeline } = passes[i];
      this.device.queue.writeBuffer(
        this.paramBuffers[i],
        0,
        sssParamsData(
          SSS_PASS_DIRECTIONS[i],
          this.tanHalfFov,
          viewportPixels,
        ) as unknown as ArrayBuffer,
      );
      const bindGroup = this.device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: this.paramBuffers[i] } },
          { binding: 1, resource: source.createView() },
          { binding: 2, resource: t.depth.createView() },
          { binding: 3, resource: t.mask.createView() },
          { binding: 4, resource: this.sampler },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: dest, loadOp: 'clear', storeOp: 'store' }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
  }

  /** Swap-chain format this graph composites into. */
  get format(): GPUTextureFormat {
    return this.outputFormat;
  }

  /** Release the G-buffer textures (call when the pipeline is torn down). */
  destroy(): void {
    this.destroyTargets();
  }

  private destroyTargets(): void {
    if (!this.targets) return;
    for (const t of [this.targets.lit, this.targets.depth, this.targets.mask, this.targets.ping]) {
      t.destroy();
    }
    this.targets = undefined;
  }

  private requireTargets(): Targets {
    if (!this.targets) throw new Error('SssRenderGraph: call resize(width, height) first');
    return this.targets;
  }
}
