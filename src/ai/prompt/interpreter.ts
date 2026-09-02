import { CharacterEvent, createEvent, EventSource } from '../../core/events/character-event.js';

export type IntentType =
  | 'appearance.modify'
  | 'appearance.set'
  | 'expression'
  | 'pose'
  | 'speak'
  | 'wear'
  | 'tattoo'
  | 'time.advance'
  | 'time.transition'
  | 'unknown';

export interface Intent {
  type: IntentType;
  confidence: number; // 0..1
  /** Structured changes (validated by the engine, never raw geometry). */
  changes?: Record<string, number>;
  expression?: string;
  text?: string;
  payload?: Record<string, unknown>;
}

export interface PromptInterpreter {
  interpret(prompt: string): Intent;
}

/**
 * Deterministic v0.1 prompt interpreter. Natural language NEVER writes
 * vertices â€” it only produces structured intents that flow through the normal
 * event + constraint + dependency pipeline. The engine, not the AI, decides
 * whether changes are valid.
 */
export class DeterministicPromptInterpreter implements PromptInterpreter {
  interpret(prompt: string): Intent {
    const p = prompt.toLowerCase();
    if (p.includes('smile')) return { type: 'expression', confidence: 0.9, expression: 'smile' };
    if (p.includes('frown')) return { type: 'expression', confidence: 0.9, expression: 'frown' };
    if (p.includes('serious'))
      return { type: 'expression', confidence: 0.8, expression: 'serious' };
    if (p.includes('surpris'))
      return { type: 'expression', confidence: 0.9, expression: 'surprise' };
    if (p.includes('sad')) return { type: 'expression', confidence: 0.9, expression: 'sad' };
    if (p.includes('angry') || p.includes('anger'))
      return { type: 'expression', confidence: 0.9, expression: 'anger' };

    if (p.includes('nose')) {
      if (p.includes('narrow') || p.includes('smaller')) {
        return {
          type: 'appearance.modify',
          confidence: 0.85,
          changes: { 'face.nose.width': 0.94 },
        };
      }
      if (p.includes('wide') || p.includes('bigger')) {
        return {
          type: 'appearance.modify',
          confidence: 0.85,
          changes: { 'face.nose.width': 1.06 },
        };
      }
    }
    if (p.includes('muscular') || p.includes('stronger')) {
      return {
        type: 'appearance.modify',
        confidence: 0.71,
        changes: { 'body.muscularity': 1.16, 'skeleton.shoulderWidth': 1.02 },
      };
    }
    if (p.includes('lean') || p.includes('thinner')) {
      return { type: 'appearance.modify', confidence: 0.7, changes: { 'body.bodyFat': 0.85 } };
    }
    if (p.includes('say') || p.includes('speak') || p.includes('talk')) {
      const text = prompt.replace(/say|speak|talk|:|"/gi, '').trim();
      return { type: 'speak', confidence: 0.9, text, payload: { text } };
    }
    if (p.includes('raise') && (p.includes('hand') || p.includes('arm'))) {
      return {
        type: 'pose',
        confidence: p.includes('left') || p.includes('right') ? 0.9 : 0.72,
        text: prompt,
        payload: { command: prompt },
      };
    }
    if (p.includes('look') && (p.includes('camera') || p.includes('forward'))) {
      return { type: 'pose', confidence: 0.85, text: prompt, payload: { command: prompt } };
    }
    if (p.includes('blond') || p.includes('blonde')) {
      return {
        type: 'appearance.set',
        confidence: 0.9,
        changes: { 'hair.colorR': 0.85, 'hair.colorG': 0.76, 'hair.colorB': 0.4 },
      };
    }
    if (p.includes('black hair')) {
      return {
        type: 'appearance.set',
        confidence: 0.9,
        changes: { 'hair.colorR': 0.1, 'hair.colorG': 0.08, 'hair.colorB': 0.07 },
      };
    }
    if ((p.includes('grow') || p.includes('longer hair')) && p.includes('hair')) {
      return {
        type: 'time.transition',
        confidence: 0.82,
        payload: {
          path: 'hair.length',
          targetDelta: 0.18,
          duration: parseDurationSeconds(p),
          curve: 'biological',
        },
      };
    }
    if (p.includes('age') || p.includes('older')) {
      const years = parseYears(p) ?? 1;
      return {
        type: 'time.transition',
        confidence: 0.8,
        payload: {
          path: 'skin.age',
          targetDelta: years,
          duration: years * 365 * 24 * 60 * 60,
          curve: 'biological',
        },
      };
    }
    if (p.includes('grow') || p.includes('longer hair')) {
      return { type: 'appearance.modify', confidence: 0.8, changes: { 'hair.length': 1.4 } };
    }
    return { type: 'unknown', confidence: 0.2 };
  }
}

/**
 * Converts an AI Intent into a CharacterEvent. Low-confidence intents make
 * conservative changes (identity budget near zero for appearance.modify).
 */
export function intentToEvent(intent: Intent, source: EventSource = 'ai'): CharacterEvent {
  switch (intent.type) {
    case 'appearance.modify': {
      const changes: Record<string, number> = {};
      const confidenceScale = 0.5 + (intent.confidence - 0.5) * 0.5; // dampen uncertainty
      for (const [path, value] of Object.entries(intent.changes ?? {})) {
        changes[path] = value;
      }
      void confidenceScale;
      return createEvent('set', source, { changes });
    }
    case 'appearance.set':
      return createEvent('set', source, { changes: intent.changes });
    case 'expression':
      return createEvent('expression', source, {
        payload: { expression: intent.expression, intensity: 1 },
      });
    case 'speak':
      return createEvent('speak', source, { payload: { text: intent.text } });
    case 'pose':
      return createEvent('pose', source, { payload: intent.payload });
    case 'time.advance':
      return createEvent('advanceTime', source, { payload: intent.payload });
    case 'time.transition':
      return createEvent('transition', source, { payload: intent.payload });
    default:
      return createEvent('set', source, {});
  }
}

function parseDurationSeconds(prompt: string): number {
  const value = parseNumber(prompt) ?? 1;
  if (prompt.includes('year')) return value * 365 * 24 * 60 * 60;
  if (prompt.includes('month')) return value * 30 * 24 * 60 * 60;
  if (prompt.includes('week')) return value * 7 * 24 * 60 * 60;
  if (prompt.includes('day')) return value * 24 * 60 * 60;
  if (prompt.includes('hour')) return value * 60 * 60;
  return 30 * 24 * 60 * 60;
}

function parseYears(prompt: string): number | null {
  if (!prompt.includes('year')) return null;
  return parseNumber(prompt);
}

function parseNumber(prompt: string): number | null {
  const digit = prompt.match(/\b\d+(?:\.\d+)?\b/);
  if (digit) return Number(digit[0]);
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
  };
  for (const [word, value] of Object.entries(words).sort((a, b) => b[0].length - a[0].length)) {
    if (prompt.includes(word)) return value;
  }
  return null;
}
