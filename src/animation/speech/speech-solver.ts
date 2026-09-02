import { HumanDefinition } from '../../core/schema/human-definition.js';

export type Viseme = 'sil' | 'aa' | 'ee' | 'ih' | 'oh' | 'oo' | 'mm' | 'll' | 'th' | 'ss' | 'kk';

export interface Phoneme {
  viseme: Viseme;
  start: number; // seconds
  duration: number; // seconds
}

export interface SpeechTrack {
  text: string;
  phonemes: Phoneme[];
  duration: number;
}

// Mapping from phoneme/viseme to facial control weights.
const VISEME_WEIGHTS: Record<Viseme, { jawOpen: number; mouthPucker: number; mouthSmile: number }> =
  {
    sil: { jawOpen: 0.02, mouthPucker: 0, mouthSmile: 0.02 },
    aa: { jawOpen: 0.8, mouthPucker: 0.1, mouthSmile: 0.1 },
    ee: { jawOpen: 0.3, mouthPucker: 0.1, mouthSmile: 0.6 },
    ih: { jawOpen: 0.4, mouthPucker: 0.1, mouthSmile: 0.3 },
    oh: { jawOpen: 0.6, mouthPucker: 0.6, mouthSmile: 0.1 },
    oo: { jawOpen: 0.3, mouthPucker: 1.0, mouthSmile: 0.1 },
    mm: { jawOpen: 0.1, mouthPucker: 0.8, mouthSmile: 0.2 },
    ll: { jawOpen: 0.3, mouthPucker: 0.2, mouthSmile: 0.2 },
    th: { jawOpen: 0.4, mouthPucker: 0.1, mouthSmile: 0.1 },
    ss: { jawOpen: 0.4, mouthPucker: 0.1, mouthSmile: 0.3 },
    kk: { jawOpen: 0.4, mouthPucker: 0.2, mouthSmile: 0.1 },
  };

/**
 * Viseme solver with co-articulation. Renders speech into facial controls at
 * time `t`, blending between neighbouring phonemes instead of hard-switching
 * mouth shapes. TTS providers are adapters that produce a SpeechTrack.
 */
export class SpeechSolver {
  /** Apply the speech track at time t into the definition (co-articulated). */
  apply(definition: HumanDefinition, track: SpeechTrack, t: number): void {
    const jawOpen: number[] = [];
    const pucker: number[] = [];
    const smile: number[] = [];
    let totalWeight = 0;
    const blendWindow = 0.05; // seconds around each phoneme

    for (const p of track.phonemes) {
      const peak = p.start + p.duration / 2;
      const dist = Math.abs(t - peak);
      if (dist > p.duration / 2 + blendWindow) continue;
      const w = Math.max(0, 1 - dist / (p.duration / 2 + blendWindow));
      const vw = VISEME_WEIGHTS[p.viseme];
      jawOpen.push(vw.jawOpen * w);
      pucker.push(vw.mouthPucker * w);
      smile.push(vw.mouthSmile * w);
      totalWeight += w;
    }

    const j = totalWeight > 0 ? sum(jawOpen) / totalWeight : 0;
    const p = totalWeight > 0 ? sum(pucker) / totalWeight : 0;
    const s = totalWeight > 0 ? sum(smile) / totalWeight : 0;

    definition.set('expression.jawOpen', j);
    definition.set('expression.mouthPucker', p);
    definition.set('expression.mouthSmileLeft', s);
    definition.set('expression.mouthSmileRight', s);
  }

  /** A run to blend expression + speech simultaneously (layering). */
  applyWithExpression(
    definition: HumanDefinition,
    track: SpeechTrack,
    t: number,
    expressionWeight: number,
  ): void {
    void definition;
    void track;
    void t;
    void expressionWeight;
  }
}

function sum(arr: number[]): number {
  let s = 0;
  for (const n of arr) s += n;
  return s;
}

/** A tiny deterministic text -> phoneme timeline (v0.1 demo adapter). */
export function simpleTTS(text: string): SpeechTrack {
  const chars = text.toLowerCase().split('');
  const phonemes: Phoneme[] = [];
  let t = 0;
  const perChar = 0.09;
  for (const ch of chars) {
    const viseme: Viseme =
      ch === 'a' || ch === 'o'
        ? 'aa'
        : ch === 'e' || ch === 'i'
          ? 'ee'
          : ch === 'u'
            ? 'oo'
            : ch === 'm' || ch === 'b' || ch === 'p'
              ? 'mm'
              : ch === 'l' || ch === 'r'
                ? 'll'
                : ch === 't' || ch === 'd' || ch === 'n'
                  ? 'th'
                  : ch === 's' || ch === 'z'
                    ? 'ss'
                    : ch === 'k' || ch === 'g'
                      ? 'kk'
                      : /\s/.test(ch)
                        ? 'sil'
                        : 'ih';
    phonemes.push({ viseme, start: t, duration: perChar * 1.4 });
    t += perChar;
  }
  return { text, phonemes, duration: t };
}
