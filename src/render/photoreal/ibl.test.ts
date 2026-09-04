import { describe, expect, it } from 'vitest';
import {
  STUDIO_IRRADIANCE_SH,
  environmentBRDF,
  fibonacciSphere,
  iblAmbient,
  prefilteredEnvironment,
  projectEnvironmentToSH,
  reflectDirection,
  sh9Basis,
  shIrradiance,
  studioEnvironment,
} from './ibl.js';
import type { Vec3 } from './color.js';
import { PHOTOREAL_CONSTANTS } from './constants.js';
import { PHOTOREAL_HUMAN_WGSL } from '../wgsl/photoreal-wgsl.js';

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('studio environment', () => {
  it('is brighter above the horizon than below it', () => {
    const up = studioEnvironment([0, 1, 0]);
    const down = studioEnvironment([0, -1, 0]);
    expect(up[2]).toBeGreaterThan(down[2]);
  });

  it('bounces warm off the floor (red dominant below)', () => {
    const down = studioEnvironment([0, -1, 0]);
    expect(down[0]).toBeGreaterThan(down[2]);
  });

  it('peaks toward the key panel', () => {
    const key = studioEnvironment([0.4, 0.62, 0.68]);
    const away = studioEnvironment([-0.4, -0.62, -0.68]);
    expect(key[0]).toBeGreaterThan(away[0] * 2);
  });

  it('is finite and non-negative in every direction', () => {
    for (let i = 0; i < 200; i++) {
      const c = studioEnvironment(fibonacciSphere(i, 200));
      for (const ch of c) {
        expect(Number.isFinite(ch)).toBe(true);
        expect(ch).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('spherical harmonics', () => {
  it('basis is orthonormal under the sphere quadrature', () => {
    const n = 4096;
    const dOmega = (4 * Math.PI) / n;
    const gram: number[][] = Array.from({ length: 9 }, () => new Array(9).fill(0));
    for (let i = 0; i < n; i++) {
      const b = sh9Basis(fibonacciSphere(i, n));
      for (let a = 0; a < 9; a++) {
        for (let c = 0; c < 9; c++) gram[a][c] += b[a] * b[c] * dOmega;
      }
    }
    for (let a = 0; a < 9; a++) {
      for (let c = 0; c < 9; c++) {
        expect(gram[a][c]).toBeCloseTo(a === c ? 1 : 0, 1);
      }
    }
  });

  it('projects a constant environment to a constant irradiance', () => {
    const sh = projectEnvironmentToSH(() => [1, 1, 1], 2048);
    // Cosine-weighted irradiance of unit radiance over the hemisphere is π; /π = 1.
    for (const n of [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
    ] as Vec3[]) {
      const irr = shIrradiance(sh, n);
      expect(irr[0]).toBeCloseTo(1, 2);
    }
  });

  it('directional irradiance is highest facing the bright side', () => {
    const facingKey = shIrradiance(STUDIO_IRRADIANCE_SH, [0.4, 0.62, 0.68]);
    const facingAway = shIrradiance(STUDIO_IRRADIANCE_SH, [-0.4, -0.62, -0.68]);
    expect(facingKey[0]).toBeGreaterThan(facingAway[0]);
  });

  it('bake is deterministic and non-negative', () => {
    const again = projectEnvironmentToSH();
    expect(again[0][0]).toBeCloseTo(STUDIO_IRRADIANCE_SH[0][0], 12);
    for (let i = 0; i < 400; i++) {
      const irr = shIrradiance(STUDIO_IRRADIANCE_SH, fibonacciSphere(i, 400));
      for (const ch of irr) expect(ch).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('split-sum specular', () => {
  it('env BRDF stays bounded across roughness and view angle', () => {
    for (let r = 0; r <= 1.0001; r += 0.1) {
      for (let nv = 0.02; nv <= 1; nv += 0.1) {
        const { scale, bias } = environmentBRDF(nv, r);
        expect(Number.isFinite(scale)).toBe(true);
        expect(Number.isFinite(bias)).toBe(true);
        expect(scale).toBeGreaterThanOrEqual(0);
        expect(bias).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('prefiltered probe equals the mirror sample at roughness 0', () => {
    const dir: Vec3 = [0.3, 0.5, 0.8];
    const sharp = studioEnvironment(dir);
    const pre = prefilteredEnvironment(dir, 0);
    expect(pre[0]).toBeCloseTo(sharp[0], 6);
  });

  it('roughness blurs the probe toward the low-frequency average', () => {
    const dir: Vec3 = [0.4, 0.62, 0.68]; // straight at the key panel
    const sharp = prefilteredEnvironment(dir, 0)[0];
    const rough = prefilteredEnvironment(dir, 1)[0];
    expect(rough).toBeLessThan(sharp);
  });

  it('reflect returns a unit mirror direction', () => {
    const r = reflectDirection([0, 0, 1], [0, 0, 1]);
    expect(Math.hypot(...r)).toBeCloseTo(1, 6);
    expect(dot(r, [0, 0, 1])).toBeCloseTo(1, 6);
  });
});

describe('ibl ambient', () => {
  const surface = {
    normal: [0, 0, 1] as Vec3,
    viewDir: [0, 0, 1] as Vec3,
    albedo: [0.72, 0.56, 0.45] as Vec3,
    roughness: 0.35,
    f0: 0.028,
    occlusion: 1,
  };

  it('is direction dependent, unlike the constant it replaces', () => {
    const facingKey = iblAmbient({ ...surface, normal: [0.4, 0.62, 0.68], viewDir: [0, 0, 1] });
    const facingFloor = iblAmbient({ ...surface, normal: [0, -1, 0], viewDir: [0, 0, 1] });
    expect(facingKey[1]).not.toBeCloseTo(facingFloor[1], 3);
  });

  it('occlusion darkens the diffuse term', () => {
    const lit = iblAmbient(surface);
    const dark = iblAmbient({ ...surface, occlusion: 0 });
    expect(dark[0]).toBeLessThan(lit[0]);
  });

  it('keeps the albedo hue in the diffuse response', () => {
    const c = iblAmbient({ ...surface, roughness: 1, specularOcclusion: 0 });
    expect(c[0]).toBeGreaterThan(c[2]);
  });

  it('is finite and non-negative for a sweep of surfaces', () => {
    for (let i = 0; i < 120; i++) {
      const n = fibonacciSphere(i, 120);
      for (const r of [0, 0.25, 0.6, 1]) {
        const c = iblAmbient({ ...surface, normal: n, roughness: r });
        for (const ch of c) {
          expect(Number.isFinite(ch)).toBe(true);
          expect(ch).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('WGSL parity for the probe', () => {
  it('embeds the nine baked SH coefficients and the probe functions', () => {
    expect(PHOTOREAL_HUMAN_WGSL).toContain('const IBL_SH = array<vec3f, 9>(');
    for (const fn of [
      'fn studioEnvironment',
      'fn shIrradiance',
      'fn environmentBRDF',
      'fn prefilteredEnvironment',
      'fn iblAmbient',
    ]) {
      expect(PHOTOREAL_HUMAN_WGSL, `${fn} missing`).toContain(fn);
    }
  });

  it('uses the probe rather than the constant ambient term', () => {
    expect(PHOTOREAL_HUMAN_WGSL).toContain('color += iblAmbient(');
    expect(PHOTOREAL_HUMAN_WGSL).not.toContain('color += albedo * (AMBIENT * cavity)');
  });

  it('embeds the shared IBL scales', () => {
    expect(PHOTOREAL_HUMAN_WGSL).toContain(String(PHOTOREAL_CONSTANTS.iblDiffuseScale));
    expect(PHOTOREAL_HUMAN_WGSL).toContain(String(PHOTOREAL_CONSTANTS.iblSpecularScale));
  });
});
