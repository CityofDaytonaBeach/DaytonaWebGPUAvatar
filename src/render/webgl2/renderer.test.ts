import { describe, expect, it } from 'vitest';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human';
import { buildWebGL2RenderParts, webglPartColor } from './renderer';

describe('WebGL2 fallback renderer metadata', () => {
  it('builds drawable ranges for body and every canonical detail part', () => {
    const canonical = new CanonicalHuman(['root', 'head']);
    const parts = buildWebGL2RenderParts(canonical);

    expect(parts[0].name).toBe('body');
    expect(parts.map((p) => p.name)).toEqual(['body', ...canonical.parts.map((p) => p.name)]);
    expect(parts.reduce((sum, p) => sum + p.indexCount, 0)).toBe(canonical.indices.length);
  });

  it('uses distinct material colors for eye, mouth, and skin parts', () => {
    expect(webglPartColor('eye_l', 'sclera')).toEqual([0.95, 0.95, 0.95]);
    expect(webglPartColor('pupil_l', 'iris')).toEqual([0.12, 0.1, 0.12]);
    expect(webglPartColor('tongue', 'tongue')).toEqual([0.82, 0.5, 0.48]);
    expect(webglPartColor('body', 'skin')).toEqual([0.72, 0.56, 0.45]);
  });
});
