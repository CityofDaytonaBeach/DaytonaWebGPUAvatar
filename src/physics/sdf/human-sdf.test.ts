import { describe, expect, it } from 'vitest';
import { Human } from '../../human';

describe('human SDF collision prototype', () => {
  it('builds semantic collision primitives for major body regions', async () => {
    const human = await Human.create();
    const field = human.sdfField();

    expect(field.primitives.length).toBeGreaterThanOrEqual(13);
    expect(field.primitives.map((p) => p.region)).toContain('torso');
    expect(field.primitives.map((p) => p.region)).toContain('head');
    expect(field.primitives.map((p) => p.region)).toContain('forearm_l');
  });

  it('returns negative distance inside the body and positive distance outside', async () => {
    const human = await Human.create();
    const field = human.sdfField();
    const dims = human.solveAnatomy();

    const inside = field.sample({ x: 0, y: dims.hipHeight + 0.08, z: 0 });
    const outside = field.sample({ x: 3, y: dims.hipHeight, z: 0 });

    expect(inside.region).toBe('torso');
    expect(inside.distance).toBeLessThan(0);
    expect(outside.distance).toBeGreaterThan(1);
  });

  it('tracks semantic limb regions with closest-region reporting', async () => {
    const human = await Human.create();
    const field = human.sdfField();
    const forearm = field.primitives.find((p) => p.region === 'forearm_l')!;
    const point = {
      x: (forearm.a.x + forearm.b!.x) / 2,
      y: (forearm.a.y + forearm.b!.y) / 2,
      z: (forearm.a.z + forearm.b!.z) / 2,
    };

    expect(field.sample(point).region).toBe('forearm_l');
  });

  it('responds to body parameter changes without mutating mesh topology', async () => {
    const human = await Human.create();
    const beforeVertexCount = human.canonicalRef.vertexCount;
    const p = { x: 0.42, y: human.solveAnatomy().hipHeight + 0.08, z: 0 };
    const lean = human.sdfDistance(p);

    human.modify({ 'body.waist': 1.8, 'body.bodyFat': 0.6 });
    const larger = human.sdfDistance(p);

    expect(larger).toBeLessThan(lean);
    expect(human.canonicalRef.vertexCount).toBe(beforeVertexCount);
  });
});
