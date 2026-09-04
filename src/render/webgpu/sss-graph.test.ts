import { describe, expect, it } from 'vitest';
import {
  SSS_CLEAR_COLOR,
  SSS_GBUFFER_FORMATS,
  SSS_INTERMEDIATE_FORMAT,
  SSS_PASS_DIRECTIONS,
} from './sss-graph.js';
import {
  SSS_BLUR_WGSL,
  SSS_COMPOSITE_WGSL,
  sssBlurWgsl,
  sssParamsData,
} from '../photoreal/sss-blur.js';
import {
  PHOTOREAL_GBUFFER_WGSL,
  PHOTOREAL_HUMAN_WGSL,
  photorealGBufferWgsl,
} from '../wgsl/photoreal-wgsl.js';

describe('photoreal G-buffer shader variant', () => {
  it('declares three color targets in radiance/depth/mask order', () => {
    const s = PHOTOREAL_GBUFFER_WGSL;
    expect(s).toContain('struct GBuffer {');
    expect(s).toContain('@location(0) lit : vec4f');
    expect(s).toContain('@location(1) viewDepth : vec4f');
    expect(s).toContain('@location(2) skinMask : vec4f');
    expect(s).toContain('fn fs_main(in : VSOut) -> GBuffer {');
  });

  it('emits linear radiance so the blur runs before the display transform', () => {
    // The forward variant tonemaps in-shader; the G-buffer variant must not.
    expect(PHOTOREAL_HUMAN_WGSL).toContain('return vec4f(toDisplay(color)');
    expect(PHOTOREAL_GBUFFER_WGSL).toContain('g.lit = vec4f(color, part.baseColor.a);');
    expect(PHOTOREAL_GBUFFER_WGSL).not.toContain('return vec4f(toDisplay(color)');
  });

  it('reconstructs view depth from the interpolated clip w', () => {
    expect(PHOTOREAL_GBUFFER_WGSL).toContain('1.0 / max(in.clip_position.w, 1e-6)');
  });

  it('masks scattering to skin parts only', () => {
    expect(PHOTOREAL_GBUFFER_WGSL).toContain('(flags & FLAG_SKIN) != 0u');
    expect(PHOTOREAL_GBUFFER_WGSL).toContain('g.skinMask =');
  });

  it('keeps exactly one fragment entry point', () => {
    expect(PHOTOREAL_GBUFFER_WGSL.match(/@fragment/g)).toHaveLength(1);
    expect(PHOTOREAL_GBUFFER_WGSL.match(/fn fs_main/g)).toHaveLength(1);
  });

  it('preserves the shading body verbatim apart from the entry and return', () => {
    expect(PHOTOREAL_GBUFFER_WGSL).toContain('fn iblAmbient(');
    expect(PHOTOREAL_GBUFFER_WGSL).toContain('curvatureThickness');
    expect(PHOTOREAL_GBUFFER_WGSL.length).toBeGreaterThan(PHOTOREAL_HUMAN_WGSL.length - 200);
  });

  it('fails loudly when the base program shape changes', () => {
    expect(() => photorealGBufferWgsl('fn other() {}')).toThrow(/shape changed/);
  });
});

describe('SSS pass generation', () => {
  it('produces a linear blur pass with no display transform', () => {
    expect(SSS_BLUR_WGSL).not.toContain('fn toDisplay');
    expect(SSS_BLUR_WGSL).toContain('return vec4f(out, center.a);');
  });

  it('produces a composite pass that encodes for the swap chain', () => {
    expect(SSS_COMPOSITE_WGSL).toContain('fn toDisplay');
    expect(SSS_COMPOSITE_WGSL).toContain('fn acesFilmic');
    expect(SSS_COMPOSITE_WGSL).toContain('return vec4f(toDisplay(out), center.a);');
  });

  it('tonemaps the non-skin early-out too, so passthrough matches', () => {
    const body = SSS_COMPOSITE_WGSL.slice(SSS_COMPOSITE_WGSL.indexOf('if (skin <= 0.0)'));
    expect(body.slice(0, 120)).toContain('toDisplay(out)');
  });

  it('is deterministic', () => {
    expect(sssBlurWgsl()).toBe(SSS_BLUR_WGSL);
    expect(sssBlurWgsl({ tonemap: true })).toBe(SSS_COMPOSITE_WGSL);
  });

  it('keeps both passes on one bind group layout', () => {
    for (const s of [SSS_BLUR_WGSL, SSS_COMPOSITE_WGSL]) {
      expect(s).toContain('@group(0) @binding(0) var<uniform> sss : SssParams;');
      expect(s).toContain('@group(0) @binding(4) var texSampler : sampler;');
    }
  });
});

describe('SssParams uniform packing', () => {
  it('packs direction, fov tangent and viewport into 16 bytes', () => {
    const data = sssParamsData([0, 1], 0.5773502691896257, 1080);
    expect(data.byteLength).toBe(16);
    expect([...data]).toEqual([0, 1, Math.fround(0.5773502691896257), 1080]);
  });
});

describe('render graph target contract', () => {
  it('matches the shader target order and sample types', () => {
    expect(SSS_GBUFFER_FORMATS).toEqual(['rgba16float', 'r32float', 'r8unorm']);
  });

  it('keeps the intermediate target in high-precision linear light', () => {
    expect(SSS_INTERMEDIATE_FORMAT).toBe('rgba16float');
  });

  it('blurs horizontally then vertically', () => {
    expect(SSS_PASS_DIRECTIONS).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('preserves the previous single-pass clear color', () => {
    expect(SSS_CLEAR_COLOR).toEqual({ r: 0.07, g: 0.09, b: 0.12, a: 1 });
  });
});
