import { describe, expect, it } from 'vitest';
import {
  SSS_BLUR_WGSL,
  SSS_FALLOFF,
  SssSample,
  depthRejection,
  diffusionProfile,
  sssBlurPass,
  sssKernel,
  sssStepUV,
} from './sss-blur.js';
import { PHOTOREAL_CONSTANTS } from './constants.js';
import type { Vec3 } from './color.js';

const C = PHOTOREAL_CONSTANTS;

describe('diffusion profile', () => {
  it('peaks at the centre and decays outward', () => {
    let prev = diffusionProfile(0, 1);
    for (let x = 0.05; x <= 2; x += 0.05) {
      const v = diffusionProfile(x, 1);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
  });

  it('is symmetric', () => {
    expect(diffusionProfile(-0.4, 1)).toBeCloseTo(diffusionProfile(0.4, 1), 12);
  });

  it('red transports further than blue at the same distance', () => {
    const x = 0.6;
    expect(diffusionProfile(x, SSS_FALLOFF[0])).toBeGreaterThan(
      diffusionProfile(x, SSS_FALLOFF[2]),
    );
  });
});

describe('kernel', () => {
  const kernel = sssKernel();

  it('has an odd tap count centred on zero', () => {
    expect(kernel.length % 2).toBe(1);
    expect(kernel[(kernel.length - 1) / 2].offset).toBeCloseTo(0, 12);
  });

  it('conserves energy per channel', () => {
    for (let c = 0; c < 3; c++) {
      const sum = kernel.reduce((s, t) => s + t.weight[c], 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('is symmetric in offsets and weights', () => {
    for (let i = 0; i < kernel.length; i++) {
      const mirror = kernel[kernel.length - 1 - i];
      expect(kernel[i].offset).toBeCloseTo(-mirror.offset, 10);
      expect(kernel[i].weight[0]).toBeCloseTo(mirror.weight[0], 10);
    }
  });

  it('concentrates more weight in red tails than blue tails', () => {
    const tail = (c: number) =>
      kernel.filter((t) => Math.abs(t.offset) > 0.4).reduce((s, t) => s + t.weight[c], 0);
    expect(tail(0)).toBeGreaterThan(tail(2));
  });

  it('honours a requested tap count, rounding up to odd', () => {
    expect(sssKernel(8).length).toBe(9);
    expect(sssKernel(11).length).toBe(11);
  });
});

describe('screen-space step', () => {
  it('shrinks with distance so the world width stays constant', () => {
    const near = sssStepUV(0.4, 0.5, 1080);
    const far = sssStepUV(2.0, 0.5, 1080);
    expect(far).toBeLessThan(near);
    expect(near / far).toBeCloseTo(5, 1);
  });

  it('never falls below one pixel', () => {
    expect(sssStepUV(1000, 0.5, 800)).toBeCloseTo(1 / 800, 10);
  });

  it('scales with the configured blur width', () => {
    expect(sssStepUV(0.5, 0.5, 1080, C.sssBlurWidth * 2)).toBeCloseTo(
      sssStepUV(0.5, 0.5, 1080, C.sssBlurWidth) * 2,
      8,
    );
  });
});

describe('depth rejection', () => {
  it('is 1 on the same surface and near 0 across a silhouette', () => {
    expect(depthRejection(0.5, 0.5)).toBe(1);
    expect(depthRejection(0.5, 1.5)).toBeLessThan(1e-6);
  });
});

describe('blur pass', () => {
  const kernel = sssKernel();
  const sample = (color: Vec3, depth = 0.5, mask = 1): SssSample => ({ color, depth, mask });

  it('leaves a uniform region unchanged (energy preserving)', () => {
    const center = sample([0.5, 0.4, 0.35]);
    const taps = kernel.map(() => center);
    const out = sssBlurPass(center, taps, kernel);
    expect(out[0]).toBeCloseTo(0.5, 8);
    expect(out[1]).toBeCloseTo(0.4, 8);
    expect(out[2]).toBeCloseTo(0.35, 8);
  });

  it('bleeds red furthest across a lit/shadow edge', () => {
    const center = sample([0, 0, 0]);
    const taps = kernel.map((t) => (t.offset > 0 ? sample([1, 1, 1]) : center));
    const out = sssBlurPass(center, taps, kernel);
    expect(out[0]).toBeGreaterThan(out[2]);
  });

  it('rejects taps on a different surface', () => {
    const center = sample([0, 0, 0]);
    const bright = sample([1, 1, 1], 3.0); // far background
    const out = sssBlurPass(
      center,
      kernel.map(() => bright),
      kernel,
    );
    expect(out[0]).toBeLessThan(1e-3);
  });

  it('rejects non-skin taps via the mask', () => {
    const center = sample([0, 0, 0]);
    const out = sssBlurPass(
      center,
      kernel.map(() => sample([1, 1, 1], 0.5, 0)),
      kernel,
    );
    expect(out[0]).toBeLessThan(1e-6);
  });

  it('treats missing taps as the centre sample', () => {
    const center = sample([0.3, 0.2, 0.1]);
    const out = sssBlurPass(center, [], kernel);
    expect(out[0]).toBeCloseTo(0.3, 8);
  });
});

describe('generated SSS WGSL', () => {
  it('embeds the kernel and the shared parameters', () => {
    expect(SSS_BLUR_WGSL).toContain(`const SSS_TAPS         : u32 = ${sssKernel().length}u;`);
    expect(SSS_BLUR_WGSL).toContain(String(C.sssBlurWidth));
    expect(SSS_BLUR_WGSL).toContain(String(C.sssDepthFalloff));
  });

  it('mirrors the CPU helpers by name and runs as two separable passes', () => {
    for (const fn of ['fn sssStepUV', 'fn depthRejection', 'fn vs_main', 'fn fs_main']) {
      expect(SSS_BLUR_WGSL, `${fn} missing`).toContain(fn);
    }
    expect(SSS_BLUR_WGSL).toContain('direction : vec2f');
  });

  it('emits one kernel entry per tap with float literals', () => {
    const entries = SSS_BLUR_WGSL.match(/vec4f\(/g) ?? [];
    expect(entries.length).toBeGreaterThanOrEqual(sssKernel().length);
    expect(SSS_BLUR_WGSL).not.toMatch(/vec4f\(\s*NaN/);
  });
});
