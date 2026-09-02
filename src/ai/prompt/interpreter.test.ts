import { describe, expect, it } from 'vitest';
import { DeterministicPromptInterpreter, intentToEvent } from './interpreter';

describe('prompt transition interpreter', () => {
  it('compiles hair growth prompts into transition events', () => {
    const intent = new DeterministicPromptInterpreter().interpret(
      'grow her hair naturally for six months',
    );
    const event = intentToEvent(intent, 'ai');
    const payload = event.payload as Record<string, number | string>;

    expect(intent.type).toBe('time.transition');
    expect(event.type).toBe('transition');
    expect(payload.path).toBe('hair.length');
    expect(Number(payload.targetDelta)).toBeGreaterThan(0);
    expect(Number(payload.duration)).toBe(6 * 30 * 24 * 60 * 60);
  });

  it('compiles aging prompts into skin-age transitions', () => {
    const intent = new DeterministicPromptInterpreter().interpret('age her fifteen years');
    const event = intentToEvent(intent, 'ai');
    const payload = event.payload as Record<string, number | string>;

    expect(event.type).toBe('transition');
    expect(payload.path).toBe('skin.age');
    expect(Number(payload.targetDelta)).toBe(15);
  });
});
