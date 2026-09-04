import { describe, it, expect } from 'vitest';
import { runKioskSoak, buildKioskSoakScript, DEFAULT_KIOSK_SOAK_OPTIONS } from './kiosk-soak.js';
import { kioskReadinessReport } from './kiosk-ready.js';

describe('kiosk soak', () => {
  const report = runKioskSoak({ hours: 3, dt: 1 / 30 });

  it('runs the full simulated session with finite output', () => {
    expect(report.frames).toBeGreaterThan(300_000);
    expect(report.simulatedSeconds).toBeGreaterThan(3 * 3600 - 1);
    expect(report.finite).toBe(true);
  });

  it('serves many conversations including interruptions', () => {
    expect(report.conversations).toBeGreaterThan(50);
    expect(report.interruptions).toBeGreaterThan(5);
  });

  it('keeps blinking at a human cadence for the whole session', () => {
    expect(report.blinks).toBeGreaterThan(2000);
    expect(report.minBlinkGap).toBeGreaterThan(0.15);
    expect(report.meanBlinkGap).toBeGreaterThan(1);
    expect(report.meanBlinkGap).toBeLessThan(8);
    expect(report.maxAttendedBlinkGap).toBeLessThan(12);
  });

  it('keeps the gaze bounded around the attention anchor (no drift)', () => {
    expect(report.maxGazeDistance).toBeLessThan(0.6);
  });

  it('exercises every attention state and starves none', () => {
    for (const seconds of Object.values(report.stateSeconds)) {
      expect(seconds).toBeGreaterThan(30);
    }
    // No state may swallow the whole session (a stuck machine).
    expect(report.longestState.seconds).toBeLessThan(3 * 3600 * 0.9);
  });

  it('emits idle gestures and saccades throughout', () => {
    expect(report.gestures).toBeGreaterThan(50);
    expect(report.saccades).toBeGreaterThan(1000);
  });

  it('replays bit-exactly', () => {
    const again = runKioskSoak({ hours: 3, dt: 1 / 30 });
    expect(again.fingerprint).toBe(report.fingerprint);
    expect(again.blinks).toBe(report.blinks);
    expect(again.interruptions).toBe(report.interruptions);
  });

  it('builds a deterministic traffic script', () => {
    const a = buildKioskSoakScript(DEFAULT_KIOSK_SOAK_OPTIONS);
    const b = buildKioskSoakScript(DEFAULT_KIOSK_SOAK_OPTIONS);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    for (let i = 1; i < a.length; i += 1) expect(a[i]!.at).toBeGreaterThanOrEqual(a[i - 1]!.at);
  });
});

describe('kiosk readiness gate', () => {
  it('reports every required kiosk capability as implemented', () => {
    const readiness = kioskReadinessReport();
    expect(readiness.blocking.map((b) => b.capability)).toEqual([]);
    expect(readiness.ready).toBe(true);
    expect(readiness.satisfied).toBe(readiness.required);
  });

  it('keeps the long-tail roadmap explicitly deferred', () => {
    expect(kioskReadinessReport().deferred).toContain('photo-to-human reconstruction');
  });
});
