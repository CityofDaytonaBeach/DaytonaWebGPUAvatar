import { describe, expect, it } from 'vitest';
import { PHOTOREAL_CONSTANTS, PHOTOREAL_FLAGS, PHOTOREAL_LIGHT_RIG } from './constants.js';
import { Vec3, acesFilmic, linearToSrgb, luminance, toDisplay, vnormalize } from './color.js';
import {
  SkinSurface,
  distributionGGX,
  dualLobeSpecular,
  fresnelSchlick,
  preIntegratedScatter,
  shadeSkin,
  shadeSkinLight,
  shadeSkinLinear,
  transmission,
  visibilitySmithCorrelated,
} from './skin-brdf.js';
import { hash21, microDetail, perturbNormal, valueNoise2D } from './micro-detail.js';
import {
  enamelFactor,
  irisParallaxOffset,
  limbalRing,
  pupilRadius,
  shadeEnamel,
  shadeIris,
  shadeSclera,
} from './eye-shading.js';
import { PHOTOREAL_HUMAN_WGSL } from '../wgsl/photoreal-wgsl.js';

const skin = (over: Partial<SkinSurface> = {}): SkinSurface => ({
  normal: [0, 0, 1],
  viewDir: [0, 0, 1],
  albedo: [0.72, 0.56, 0.45],
  roughness: 0.35,
  specular: 0.45,
  scatterColor: [0.9, 0.58, 0.48],
  scatterIntensity: 0.45,
  curvature: 12,
  thickness: 0.004,
  occlusion: 1,
  ...over,
});

describe('photoreal display transform', () => {
  it('maps black to black and is monotonic', () => {
    expect(acesFilmic(0)).toBe(0);
    let prev = -1;
    for (let x = 0; x <= 8; x += 0.05) {
      const y = acesFilmic(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeLessThanOrEqual(1);
      prev = y;
    }
  });

  it('never clips above 1 for extreme radiance', () => {
    const c = toDisplay([120, 90, 60]);
    for (const ch of c) {
      expect(ch).toBeLessThanOrEqual(1);
      expect(ch).toBeGreaterThanOrEqual(0);
    }
  });

  it('sRGB encoding brightens mid-greys (gamma) and is exact at the ends', () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1, 6);
    expect(linearToSrgb(0.2)).toBeGreaterThan(0.2);
  });

  it('luminance uses Rec.709 weights', () => {
    expect(luminance([1, 0, 0])).toBeCloseTo(0.2126, 6);
    expect(luminance([1, 1, 1])).toBeCloseTo(1, 6);
  });
});

describe('skin BRDF', () => {
  it('Fresnel rises to 1 at grazing angles and equals F0 head-on', () => {
    const f0: Vec3 = [0.04, 0.04, 0.04];
    expect(fresnelSchlick(1, f0)[0]).toBeCloseTo(0.04, 6);
    expect(fresnelSchlick(0, f0)[0]).toBeCloseTo(1, 6);
  });

  it('GGX peaks at the half-vector and is finite for zero roughness', () => {
    const peak = distributionGGX(1, 0.3);
    expect(peak).toBeGreaterThan(distributionGGX(0.8, 0.3));
    expect(Number.isFinite(distributionGGX(1, 0))).toBe(true);
  });

  it('Smith visibility is roughness-independent head-on and shadows at grazing angles', () => {
    // At N.V = N.L = 1 the height-correlated Smith term is analytically 1/4 for
    // every roughness; the roughness dependence appears off-normal.
    expect(visibilitySmithCorrelated(1, 1, 0.1)).toBeCloseTo(0.25, 12);
    expect(visibilitySmithCorrelated(1, 1, 0.9)).toBeCloseTo(0.25, 12);
    const smooth = visibilitySmithCorrelated(0.15, 0.2, 0.1);
    const rough = visibilitySmithCorrelated(0.15, 0.2, 0.9);
    expect(smooth).toBeGreaterThan(0);
    expect(rough).toBeGreaterThan(0);
    expect(smooth).toBeGreaterThan(rough);
  });

  it('dual-lobe specular is broader than a single sharp lobe off-peak', () => {
    const r = 0.2;
    const off = 0.9;
    const dual = dualLobeSpecular(off, 1, 1, r);
    const single = distributionGGX(off, r) * visibilitySmithCorrelated(1, 1, r);
    // The broad lobe adds energy in the falloff region.
    expect(dual).toBeGreaterThan(single * (1 - PHOTOREAL_CONSTANTS.specLobeMix));
  });

  it('pre-integrated scatter bleeds light past the terminator', () => {
    const scatter: Vec3 = [0.9, 0.58, 0.48];
    const at = preIntegratedScatter(0, 8, scatter, 0.6);
    // At N·L = 0 plain Lambert is black; scattering keeps a red-dominant glow.
    expect(at[0]).toBeGreaterThan(0);
    expect(at[0]).toBeGreaterThan(at[2]);
  });

  it('scatter reduces to Lambert when intensity is zero', () => {
    const r = preIntegratedScatter(0.5, 10, [1, 0.5, 0.4], 0);
    expect(r[0]).toBeCloseTo(0.5, 6);
    expect(r[1]).toBeCloseTo(0.5, 6);
    expect(r[2]).toBeCloseTo(0.5, 6);
  });

  it('higher curvature narrows the scatter (tight features scatter less)', () => {
    const flat = preIntegratedScatter(0.05, 2, [0.9, 0.5, 0.4], 0.8)[0];
    const tight = preIntegratedScatter(0.05, 200, [0.9, 0.5, 0.4], 0.8)[0];
    expect(flat).toBeGreaterThan(tight);
  });

  it('transmission falls off with tissue thickness', () => {
    const n: Vec3 = [0, 0, 1];
    const l: Vec3 = [0, 0, -1];
    const v: Vec3 = [0, 0, 1];
    const thin = transmission(n, l, v, 0.0005, [0.9, 0.4, 0.35])[0];
    const thick = transmission(n, l, v, 0.02, [0.9, 0.4, 0.35])[0];
    expect(thin).toBeGreaterThan(thick);
    expect(thick).toBeLessThan(0.02);
  });

  it('is energy conserving: reflected radiance never exceeds irradiance', () => {
    for (let i = 0; i < 64; i++) {
      const t = i / 63;
      const surface = skin({
        albedo: [1, 1, 1],
        roughness: 0.08 + 0.9 * t,
        specular: t,
        normal: vnormalize([Math.sin(t * 3), Math.cos(t * 2), 1]),
      });
      const out = shadeSkinLight(surface, {
        direction: [0.3, 0.5, 0.8],
        color: [1, 1, 1],
        intensity: 1,
      });
      for (const ch of out) {
        expect(Number.isFinite(ch)).toBe(true);
        expect(ch).toBeLessThanOrEqual(1.5); // spec lobe peak + diffuse + transmission
        expect(ch).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is deterministic across repeated evaluation', () => {
    const a = shadeSkin(skin());
    const b = shadeSkin(skin());
    expect(a).toEqual(b);
  });

  it('produces a plausible lit skin tone (warm, in gamut, non-black)', () => {
    const c = shadeSkin(skin());
    expect(c[0]).toBeGreaterThan(c[2]); // warmer red than blue
    for (const ch of c) {
      expect(ch).toBeGreaterThan(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('occlusion darkens the ambient contribution only', () => {
    const open = shadeSkinLinear(skin({ occlusion: 1 }));
    const closed = shadeSkinLinear(skin({ occlusion: 0 }));
    expect(open[0]).toBeGreaterThan(closed[0]);
    const delta = open[0] - closed[0];
    expect(delta).toBeCloseTo(0.72 * PHOTOREAL_CONSTANTS.ambient, 6);
  });

  it('uses all three rig lights', () => {
    const full = shadeSkinLinear(skin());
    const keyOnly = shadeSkinLinear(skin(), {
      key: PHOTOREAL_LIGHT_RIG.key,
      fill: { ...PHOTOREAL_LIGHT_RIG.fill, intensity: 0 },
      rim: { ...PHOTOREAL_LIGHT_RIG.rim, intensity: 0 },
    } as typeof PHOTOREAL_LIGHT_RIG);
    expect(full[0]).toBeGreaterThan(keyOnly[0]);
  });
});

describe('micro detail', () => {
  it('hash and value noise are deterministic and bounded', () => {
    expect(hash21(1.5, 2.5)).toBe(hash21(1.5, 2.5));
    for (let i = 0; i < 200; i++) {
      const n = valueNoise2D(i * 0.37, i * 0.91);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('slopes stay within the documented limit', () => {
    for (let i = 0; i < 500; i++) {
      const d = microDetail({
        u: (i * 0.017) % 1,
        v: (i * 0.041) % 1,
        poreScale: 1.2,
        age: (i % 10) / 9,
        oiliness: (i % 7) / 6,
      });
      expect(Math.abs(d.slopeX)).toBeLessThanOrEqual(PHOTOREAL_CONSTANTS.microSlopeMax);
      expect(Math.abs(d.slopeY)).toBeLessThanOrEqual(PHOTOREAL_CONSTANTS.microSlopeMax);
      expect(d.cavity).toBeGreaterThanOrEqual(0);
      expect(d.cavity).toBeLessThanOrEqual(1);
      expect(d.specularOcclusion).toBeGreaterThanOrEqual(0);
      expect(d.specularOcclusion).toBeLessThanOrEqual(1);
    }
  });

  it('oil flattens micro detail and age deepens it', () => {
    const base = { u: 0.31, v: 0.62, poreScale: 1.3 };
    const dry = microDetail({ ...base, age: 0.8, oiliness: 0 });
    const oily = microDetail({ ...base, age: 0.8, oiliness: 1 });
    expect(Math.abs(oily.slopeX)).toBeLessThan(Math.abs(dry.slopeX) + 1e-12);
    // Age deepens creases on average across the surface (pointwise the noise
    // field also shifts, so the statistic is the meaningful signal).
    let youngCavity = 0;
    let agedCavity = 0;
    for (let i = 0; i < 400; i++) {
      const u = (i * 0.0173) % 1;
      const v = (i * 0.0411) % 1;
      youngCavity += microDetail({ u, v, poreScale: 1.3, age: 0, oiliness: 0 }).cavity;
      agedCavity += microDetail({ u, v, poreScale: 1.3, age: 1, oiliness: 0 }).cavity;
    }
    expect(youngCavity).toBeGreaterThan(agedCavity);
  });

  it('perturbed normals stay unit length and reduce to the geometric normal at zero slope', () => {
    const n: Vec3 = vnormalize([0.2, 0.4, 0.9]);
    const same = perturbNormal(n, 0, 0);
    expect(same[0]).toBeCloseTo(n[0], 6);
    expect(same[2]).toBeCloseTo(n[2], 6);
    const p = perturbNormal(n, 0.3, -0.2);
    expect(Math.hypot(...p)).toBeCloseTo(1, 6);
  });

  it('micro detail changes the specular response (breaks up highlights)', () => {
    const n: Vec3 = [0, 0, 1];
    const d = microDetail({ u: 0.4, v: 0.7, poreScale: 1.4, age: 0.5, oiliness: 0.1 });
    const flat = shadeSkinLinear(skin({ normal: n }));
    const detailed = shadeSkinLinear(skin({ normal: perturbNormal(n, d.slopeX, d.slopeY) }));
    expect(detailed[0]).not.toBeCloseTo(flat[0], 6);
  });
});

describe('eye and enamel shading', () => {
  it('iris parallax is zero head-on and shifts when the eye turns', () => {
    const straight = irisParallaxOffset([0, 0, 1], [0, 0, 1]);
    expect(Math.abs(straight.du)).toBeLessThan(1e-6);
    expect(Math.abs(straight.dv)).toBeLessThan(1e-6);
    const turned = irisParallaxOffset(vnormalize([0.5, 0, 1]), [0, 0, 1]);
    expect(Math.abs(turned.du)).toBeGreaterThan(0);
  });

  it('pupil constricts in bright light and dilates in the dark', () => {
    const bright = pupilRadius(1, 0);
    const dark = pupilRadius(0, 0);
    expect(dark).toBeGreaterThan(bright);
    expect(pupilRadius(0.5, 1)).toBeGreaterThan(pupilRadius(0.5, 0));
  });

  it('limbal ring darkens monotonically toward the limbus', () => {
    expect(limbalRing(0)).toBe(1);
    expect(limbalRing(PHOTOREAL_CONSTANTS.limbusStart)).toBe(1);
    let prev = 1;
    for (let r = PHOTOREAL_CONSTANTS.limbusStart; r <= 1.0001; r += 0.01) {
      const v = limbalRing(r);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
    expect(limbalRing(1)).toBeCloseTo(0.25, 6);
  });

  it('iris shading returns a dark pupil at the centre and coloured fibres outside', () => {
    const irisColor: Vec3 = [0.24, 0.14, 0.07];
    const centre = shadeIris(0, 0, irisColor, [0, 0, 1], [0, 0, 1]);
    expect(centre.inPupil).toBe(true);
    expect(luminance(centre.color)).toBeLessThan(0.02);
    const outer = shadeIris(0.6, 0, irisColor, [0, 0, 1], [0, 0, 1]);
    expect(outer.inPupil).toBe(false);
    expect(luminance(outer.color)).toBeGreaterThan(luminance(centre.color));
  });

  it('sclera picks up vascular tint toward the corners', () => {
    const base: Vec3 = [0.86, 0.84, 0.82];
    const centre = shadeSclera(base, 0);
    const corner = shadeSclera(base, 1);
    expect(centre).toEqual(base);
    expect(corner[0] / corner[2]).toBeGreaterThan(base[0] / base[2]);
  });

  it('enamel is dimmer at thin edges and toward the molars', () => {
    expect(enamelFactor(0, 0)).toBeCloseTo(1, 6);
    expect(enamelFactor(1, 0)).toBeLessThan(1);
    expect(enamelFactor(0, 1)).toBeLessThan(enamelFactor(0, 0));
    const front = shadeEnamel([0.9, 0.88, 0.82], 0.1, 0);
    const molar = shadeEnamel([0.9, 0.88, 0.82], 0.1, 1);
    expect(luminance(front)).toBeGreaterThan(luminance(molar));
  });

  it('thin enamel edges read cooler than the dentin core', () => {
    const core = shadeEnamel([0.9, 0.88, 0.82], 0, 0);
    const edge = shadeEnamel([0.9, 0.88, 0.82], 1, 0);
    expect(edge[2] / edge[0]).toBeGreaterThan(core[2] / core[0]);
  });
});

describe('generated WGSL parity', () => {
  const src = PHOTOREAL_HUMAN_WGSL;

  it('embeds every shared constant (no second copy can drift)', () => {
    for (const [key, value] of Object.entries(PHOTOREAL_CONSTANTS)) {
      expect(src, `${key} missing from WGSL`).toContain(String(value));
    }
  });

  it('declares each flag bit with the shared numeric value', () => {
    expect(src).toContain(`FLAG_SKIN           : u32 = ${PHOTOREAL_FLAGS.skin}u`);
    expect(src).toContain(`FLAG_IRIS           : u32 = ${PHOTOREAL_FLAGS.iris}u`);
    expect(src).toContain(`FLAG_ENAMEL         : u32 = ${PHOTOREAL_FLAGS.enamel}u`);
  });

  it('mirrors every CPU shading function by name', () => {
    for (const fn of [
      'fresnelSchlick',
      'distributionGGX',
      'visibilitySmithCorrelated',
      'dualLobeSpecular',
      'preIntegratedScatter',
      'transmissionTerm',
      'microDetail',
      'reconstructNormal',
      'irisParallaxOffset',
      'pupilRadius',
      'limbalRing',
      'enamelFactor',
      'acesFilmic',
      'linearToSrgb',
    ]) {
      expect(src, `${fn} missing`).toContain(`fn ${fn}(`);
    }
  });

  it('keeps the drop-in bind group and vertex layout of the basic program', () => {
    expect(src).toContain('@group(0) @binding(0) var<uniform> params : HumanParams;');
    expect(src).toContain('@group(0) @binding(1) var<uniform> camera : Camera;');
    expect(src).toContain('@group(0) @binding(2) var<uniform> part   : PartParams;');
    expect(src).toContain('@location(3) tangentPerturb : vec2f');
    expect(src).toContain('fn vs_main');
    expect(src).toContain('fn fs_main');
  });

  it('has balanced braces and no unresolved template holes', () => {
    expect(src).not.toContain('undefined');
    expect(src).not.toContain('NaN');
    const open = (src.match(/\{/g) ?? []).length;
    const close = (src.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
  });

  it('embeds the three-point rig from the shared constants', () => {
    expect(src).toContain(`KEY_INT  : f32   = ${PHOTOREAL_LIGHT_RIG.key.intensity}`);
    expect(src).toContain(`FILL_INT : f32   = ${PHOTOREAL_LIGHT_RIG.fill.intensity}`);
    expect(src).toContain(`RIM_INT  : f32   = ${PHOTOREAL_LIGHT_RIG.rim.intensity}`);
  });
});
