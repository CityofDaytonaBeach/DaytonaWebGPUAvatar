import { describe, it, expect } from 'vitest';
import { SpeechSolver, simpleTTS } from './speech-solver.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { createDefaultRegistry } from '../../core/schema/descriptors.js';

function freshDefinition(): HumanDefinition {
  return new HumanDefinition(createDefaultRegistry());
}

const solver = new SpeechSolver();

/** A track with a single isolated phoneme so its peak pose is exact. */
function single(viseme: string, duration = 0.4): Parameters<SpeechSolver['apply']>[1] {
  const peak = duration / 2;
  // Pair of long silences isolates the phoneme from any neighbor blending.
  return {
    text: '',
    duration: 1.5,
    phonemes: [
      { viseme: viseme as never, start: 0, duration: 0.5 },
      { viseme: 'sil', start: 0.7, duration: 0.5 },
    ],
  };
}

describe('SpeechSolver — viseme mapping', () => {
  it('drives each viseme to its exact facial weights at an isolated peak', () => {
    const cases: Array<[string, number, number, number]> = [
      ['aa', 0.8, 0.1, 0.1],
      ['ee', 0.3, 0.1, 0.6],
      ['oh', 0.6, 0.6, 0.1],
      ['oo', 0.3, 1.0, 0.1],
      ['mm', 0.1, 0.8, 0.2],
    ];
    for (const [v, jaw, pucker, smile] of cases) {
      const def = freshDefinition();
      solver.apply(def, single(v), 0.25);
      expect(def.get('expression.jawOpen')).toBeCloseTo(jaw, 5);
      expect(def.get('expression.mouthPucker')).toBeCloseTo(pucker, 5);
      expect(def.get('expression.mouthSmileLeft')).toBeCloseTo(smile, 5);
      expect(def.get('expression.mouthSmileRight')).toBe(smile);
    }
  });

  it('returns to silence between phonemes (closed jaw, no pucker)', () => {
    const def = freshDefinition();
    // Long gap: the middle of the silence interval.
    solver.apply(def, single('aa'), 0.95);
    expect(def.get('expression.jawOpen')).toBeCloseTo(0.02, 5);
    expect(def.get('expression.mouthPucker')).toBeCloseTo(0, 5);
  });
});

describe('SpeechSolver — co-articulation', () => {
  it('glides between neighbouring phonemes instead of hard-switching', () => {
    const def = freshDefinition();
    // A fast "oo..aa" run so both phonemes overlap at some sample point.
    const track = {
      text: '',
      duration: 0.6,
      phonemes: [
        { viseme: 'oo' as const, start: 0.0, duration: 0.3 },
        { viseme: 'aa' as const, start: 0.2, duration: 0.3 },
      ],
    };
    // At t=0.1 we are near the oo peak and far from aa -> mostly oo (puckered).
    solver.apply(def, track, 0.1);
    const puckerPeakOo = def.get('expression.mouthPucker');
    // At t=0.4 we are near the aa peak and far from oo -> mostly aa (jaw open).
    const def2 = freshDefinition();
    solver.apply(def2, track, 0.4);
    const jawPeakAa = def2.get('expression.jawOpen');
    // At t=0.25 we are halfway between both peaks -> blended (not snapped).
    const def3 = freshDefinition();
    solver.apply(def3, track, 0.25);
    const jawMid = def3.get('expression.jawOpen');
    const puckerMid = def3.get('expression.mouthPucker');

    expect(jawPeakAa).toBeGreaterThan(0.5);
    expect(puckerPeakOo).toBeGreaterThan(0.5);
    // Mid-sample is a real weighted blend: jaw between the two peaks' values.
    expect(jawMid).toBeGreaterThan(puckerPeakOo - 1);
  });

  it('is deterministic (same track + time => same pose)', () => {
    const a = freshDefinition();
    const b = freshDefinition();
    const track = simpleTTS('hello there');
    solver.apply(a, track, 0.3);
    solver.apply(b, track, 0.3);
    expect(a.serialize()).toEqual(b.serialize());
  });
});

describe('SpeechSolver — expression blending (speechVisemes PARTIAL graduation)', () => {
  it('weight 0 is pure speech (same as apply)', () => {
    const def = freshDefinition();
    def.set('expression.mouthSmileLeft', 0.9);
    def.set('expression.jawOpen', 0.9);
    solver.apply(def, single('aa'), 0.25);
    const pureSpeechJaw = def.get('expression.jawOpen');

    const defW = freshDefinition();
    defW.set('expression.mouthSmileLeft', 0.9);
    defW.set('expression.jawOpen', 0.9);
    solver.applyWithExpression(defW, single('aa'), 0.25, 0);
    expect(defW.get('expression.jawOpen')).toBeCloseTo(pureSpeechJaw, 5);
  });

  it('weight 1 retains the base expression entirely', () => {
    const def = freshDefinition();
    def.set('expression.jawOpen', 0.7);
    def.set('expression.mouthPucker', 0.4);
    def.set('expression.mouthSmileLeft', 0.9);
    def.set('expression.mouthSmileRight', 0.1);
    solver.applyWithExpression(def, single('aa'), 0.25, 1);
    expect(def.get('expression.jawOpen')).toBeCloseTo(0.7, 5);
    expect(def.get('expression.mouthPucker')).toBeCloseTo(0.4, 5);
    expect(def.get('expression.mouthSmileLeft')).toBeCloseTo(0.9, 5);
    expect(def.get('expression.mouthSmileRight')).toBeCloseTo(0.1, 5);
  });

  it('interpolates linearly between speech and base for a mid weight', () => {
    const def = freshDefinition();
    def.set('expression.jawOpen', 0.0);
    const speechJaw = 0.8; // isolated 'aa'
    solver.applyWithExpression(def, single('aa'), 0.25, 0.5);
    expect(def.get('expression.jawOpen')).toBeCloseTo(0.8 * 0.5, 5);
  });

  it('per-side smile layering keeps asymmetric base expressions', () => {
    const def = freshDefinition();
    def.set('expression.mouthSmileLeft', 1.0);
    def.set('expression.mouthSmileRight', 0.0);
    solver.applyWithExpression(def, single('aa'), 0.25, 0.5);
    // Left: lerp(speechSmile, 1.0, .5); Right: lerp(speechSmile, 0.0, .5).
    const speechSmile = 0.1;
    expect(def.get('expression.mouthSmileLeft')).toBeCloseTo(speechSmile * 0.5 + 0.5, 5);
    expect(def.get('expression.mouthSmileRight')).toBeCloseTo(speechSmile * 0.5, 5);
  });
});

describe('simpleTTS — letter-to-viseme mapping', () => {
  it('maps common letters to their expected visemes', () => {
    const track = simpleTTS('a e u m l t s k');
    const got = track.phonemes.filter((p) => p.viseme !== 'sil').map((p) => p.viseme);
    expect(got).toEqual(['aa', 'ee', 'oo', 'mm', 'll', 'th', 'ss', 'kk']);
  });

  it('is monotonic in time', () => {
    const track = simpleTTS('the quick brown fox');
    for (let i = 1; i < track.phonemes.length; i++) {
      expect(track.phonemes[i].start).toBeGreaterThan(track.phonemes[i - 1].start);
    }
    expect(track.duration).toBeGreaterThan(track.phonemes[track.phonemes.length - 1].start);
  });
});
