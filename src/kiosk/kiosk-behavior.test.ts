import { describe, it, expect } from 'vitest';
import { KioskBehavior } from './kiosk-behavior.js';

const dt = 1 / 60;
const visitor = { x: 0, y: 1.6, z: 1.4 };

function advance(behavior: KioskBehavior, seconds: number) {
  let frame = behavior.tick(dt);
  for (let i = 1; i < Math.round(seconds / dt); i += 1) frame = behavior.tick(dt);
  return frame;
}

describe('KioskBehavior', () => {
  it('starts idle and switches to listening when a visitor arrives', () => {
    const behavior = new KioskBehavior();
    expect(behavior.tick(dt).state).toBe('idle');
    behavior.setVisitor(visitor);
    expect(behavior.tick(dt).state).toBe('listening');
  });

  it('walks the conversational cycle', () => {
    const behavior = new KioskBehavior();
    behavior.setVisitor(visitor);
    behavior.listen();
    expect(advance(behavior, 0.5).state).toBe('listening');
    behavior.think();
    expect(advance(behavior, 0.5).state).toBe('thinking');
    behavior.speak();
    expect(advance(behavior, 0.5).state).toBe('speaking');
    behavior.finishSpeaking();
    expect(advance(behavior, 0.5).state).toBe('listening');
  });

  it('drops back to idle after the visitor leaves', () => {
    const behavior = new KioskBehavior({ visitorTimeout: 1 });
    behavior.setVisitor(visitor);
    advance(behavior, 0.5);
    behavior.setVisitor(null);
    expect(advance(behavior, 2).state).toBe('idle');
  });

  it('never gets stuck thinking', () => {
    const behavior = new KioskBehavior({ maxThinkingSeconds: 2 });
    behavior.setVisitor(visitor);
    behavior.think();
    expect(advance(behavior, 4).state).not.toBe('thinking');
  });

  it('interruption cuts speech, acknowledges, and listens', () => {
    const behavior = new KioskBehavior();
    behavior.setVisitor(visitor);
    behavior.speak();
    advance(behavior, 1);
    expect(behavior.interrupt()).toBe(true);
    const frame = behavior.tick(dt);
    expect(frame.state).toBe('listening');
    expect(frame.interrupting).toBe(true);
    expect(frame.gesture).toBe('nod');
    // Acknowledgement ends and normal gesture scheduling resumes.
    const later = advance(behavior, 1.5);
    expect(later.interrupting).toBe(false);
    expect(behavior.status().interruptions).toBe(1);
  });

  it('re-acquires eye contact on interruption', () => {
    const behavior = new KioskBehavior();
    behavior.setVisitor(visitor);
    behavior.think();
    const averted = advance(behavior, 2).lookAtTarget;
    const avertedDistance = Math.hypot(
      averted.x - visitor.x,
      averted.y - visitor.y,
      averted.z - visitor.z,
    );
    behavior.interrupt();
    const after = advance(behavior, 1.5).lookAtTarget;
    const afterDistance = Math.hypot(after.x - visitor.x, after.y - visitor.y, after.z - visitor.z);
    expect(afterDistance).toBeLessThan(avertedDistance);
  });

  it('emits blink controls and posture expressions each frame', () => {
    const behavior = new KioskBehavior();
    behavior.setVisitor(visitor);
    const frame = advance(behavior, 3);
    expect(frame.expression['expression.blinkLeft']).toBeGreaterThanOrEqual(0);
    expect(frame.expression['expression.browInnerUp']).toBeGreaterThan(0);
  });

  it('applies frames to a definition and a motion target', () => {
    const behavior = new KioskBehavior();
    behavior.setVisitor(visitor);
    const written = new Map<string, number>();
    const definition = { set: (path: string, value: number) => written.set(path, value) };
    const pushed: string[] = [];
    let lastTarget = { x: 0, y: 0, z: 0 };
    let lastIntensity = 0;
    const motion = {
      setLookAtTarget: (
        target: { x: number; y: number; z: number },
        options?: { intensity?: number },
      ) => {
        lastTarget = target;
        lastIntensity = options?.intensity ?? 0;
      },
      push: (command: string) => pushed.push(command),
    };
    behavior.speak();
    const frame = advance(behavior, 1);
    behavior.apply(frame, definition, motion);
    expect(written.get('expression.blinkLeft')).toBeGreaterThanOrEqual(0);
    expect(lastTarget.z).toBeCloseTo(frame.lookAtTarget.z, 10);
    expect(lastIntensity).toBeGreaterThan(0);

    behavior.interrupt();
    behavior.apply(behavior.tick(dt), definition, motion);
    expect(pushed).toContain('nod');
  });

  it('is deterministic across identical event sequences', () => {
    const record = (): string[] => {
      const behavior = new KioskBehavior();
      const out: string[] = [];
      for (let i = 0; i < 3000; i += 1) {
        if (i === 100) behavior.setVisitor(visitor);
        if (i === 600) behavior.think();
        if (i === 900) behavior.speak();
        if (i === 1500) behavior.interrupt();
        if (i === 2400) behavior.setVisitor(null);
        const f = behavior.tick(dt);
        out.push(
          `${f.state}|${f.blink.closure.toFixed(6)}|${f.lookAtTarget.x.toFixed(6)}|${f.gesture ?? ''}`,
        );
      }
      return out;
    };
    expect(record()).toEqual(record());
  });
});
