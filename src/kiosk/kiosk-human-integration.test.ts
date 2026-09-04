import { describe, it, expect } from 'vitest';
import { Human } from '../human.js';

const dt = 1 / 60;
const visitor = { x: 0, y: 1.6, z: 1.4 };

describe('kiosk behaviour inside Human', () => {
  it('drives blink and gaze through the real update loop', async () => {
    const human = await Human.create();
    const behavior = human.startKioskBehavior();
    behavior.setVisitor(visitor);

    let sawClosedLid = 0;
    for (let i = 0; i < Math.round(12 / dt); i += 1) {
      human.update(dt);
      sawClosedLid = Math.max(sawClosedLid, human.get('expression.blinkLeft'));
    }

    expect(sawClosedLid).toBeGreaterThan(0.5);
    expect(behavior.status().blinks).toBeGreaterThan(1);

    const gaze = human.motionRuntimeRef?.status().lookAt;
    expect(gaze).not.toBeNull();
    expect(gaze!.target.z).toBeGreaterThan(0.5);
  });

  it('does not disturb identity while behaviour runs', async () => {
    const human = await Human.create();
    const before = human.get('body.muscularity');
    human.startKioskBehavior().setVisitor(visitor);
    for (let i = 0; i < 600; i += 1) human.update(dt);
    expect(human.get('body.muscularity')).toBeCloseTo(before, 10);
  });

  it('stops cleanly and clears the gaze constraint', async () => {
    const human = await Human.create();
    human.startKioskBehavior().setVisitor(visitor);
    for (let i = 0; i < 120; i += 1) human.update(dt);
    human.stopKioskBehavior();
    expect(human.kioskBehaviorRef).toBeNull();
    expect(human.motionRuntimeRef?.status().lookAt ?? null).toBeNull();
    expect(human.tickKiosk(dt)).toBeNull();
  });

  it('handles a full interrupted conversation', async () => {
    const human = await Human.create();
    const behavior = human.startKioskBehavior();
    behavior.setVisitor(visitor);
    for (let i = 0; i < 120; i += 1) human.update(dt);
    behavior.think();
    for (let i = 0; i < 120; i += 1) human.update(dt);
    behavior.speak();
    human.speak('The commission meets Wednesday at six.');
    for (let i = 0; i < 120; i += 1) human.update(dt);
    expect(behavior.currentState).toBe('speaking');
    expect(behavior.interrupt()).toBe(true);
    for (let i = 0; i < 120; i += 1) human.update(dt);
    expect(behavior.currentState).toBe('listening');
    expect(behavior.status().interruptions).toBe(1);
  });
});
