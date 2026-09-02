import { describe, expect, it } from 'vitest';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human';
import { Human } from '../../human';
import { projectTattooDecal, projectTattooDecals } from './tattoo-decal';

describe('tattoo decal projection prototype', () => {
  it('projects a tattoo attachment to deterministic region vertex samples', () => {
    const canonical = new CanonicalHuman(['root', 'head']);
    const attachment = {
      id: 'forearm-mark',
      kind: 'tattoo' as const,
      anchor: { region: 'forearm_l' as const },
      data: { radius: 0.5, color: [1.2, -1, 0.25] },
    };

    const a = projectTattooDecal(attachment, canonical)!;
    const b = projectTattooDecal(attachment, canonical)!;

    expect(a).toEqual(b);
    expect(a.samples.length).toBeGreaterThan(0);
    expect(new Set(a.samples.map((s) => s.region))).toEqual(new Set(['forearm_l']));
    expect(a.samples[0].color).toEqual([1, 0, 0.25]);
    expect(a.samples.every((s) => s.opacity >= 0 && s.opacity <= 1)).toBe(true);
  });

  it('filters non-tattoo attachments and requires region anchors', () => {
    const canonical = new CanonicalHuman(['root', 'head']);

    expect(
      projectTattooDecal({ id: 'shirt', kind: 'wearable', anchor: { region: 'torso' } }, canonical),
    ).toBeNull();
    expect(() =>
      projectTattooDecal({ id: 'bad', kind: 'tattoo', anchor: { bone: 'head' } }, canonical),
    ).toThrow(/region/);
  });

  it('is exposed through Human and does not mutate mesh topology', async () => {
    const human = await Human.create();
    const before = human.canonicalRef.vertexCount;

    human.addTattoo('nose-dot', { region: 'nose' }, { radius: 0.08, color: [0.1, 0.05, 0.02] });
    human.wear('shirt', { region: 'torso' });
    const decals = human.tattooDecals();

    expect(decals.map((d) => d.id)).toEqual(['nose-dot']);
    expect(decals[0].samples.length).toBeGreaterThan(0);
    expect(human.canonicalRef.vertexCount).toBe(before);
  });

  it('projects multiple tattoo attachments in stable order', () => {
    const canonical = new CanonicalHuman(['root', 'head']);
    const decals = projectTattooDecals(
      [
        { id: 'a', kind: 'tattoo', anchor: { region: 'nose' }, data: { radius: 0.08 } },
        { id: 'b', kind: 'tattoo', anchor: { region: 'jaw' }, data: { radius: 0.2 } },
      ],
      canonical,
    );

    expect(decals.map((d) => d.id)).toEqual(['a', 'b']);
    expect(decals.every((d) => d.samples.length > 0)).toBe(true);
  });
});
