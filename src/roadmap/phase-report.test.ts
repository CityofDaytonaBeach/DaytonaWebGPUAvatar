import { describe, expect, it } from 'vitest';
import { CAPABILITY_MATRIX } from '../index';
import { START_MD_PHASES, phaseReport } from './phase-report';

describe('start.md phase report', () => {
  it('tracks every start.md development phase in order', () => {
    const report = phaseReport();

    expect(report.total).toBe(15);
    expect(report.phases.map((phase) => phase.phase)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it('phase status is derived from its required capabilities', () => {
    const report = phaseReport();
    const byPhase = new Map(report.phases.map((p) => [p.phase, p]));

    // A phase is only COMPLETE when every required capability is IMPLEMENTED.
    expect(byPhase.get(1)!.status).toBe('PROTOTYPE'); // benchmark capabilities are prototypes
    expect(byPhase.get(2)!.status).toBe('IN_PROGRESS'); // canonicalHuman is PARTIAL
    expect(byPhase.get(7)!.status).toBe('PROTOTYPE'); // motionCompiler is a prototype
    expect(byPhase.get(9)!.status).toBe('PROTOTYPE'); // hair/clothing/cloth are prototypes
    // A required capability that is PARTIAL yields IN_PROGRESS.
    expect(byPhase.get(6)!.status).toBe('IN_PROGRESS');
    // Fully implemented phases stay COMPLETE.
    expect(byPhase.get(4)!.status).toBe('COMPLETE');
    expect(byPhase.get(11)!.status).toBe('COMPLETE');
    // parameterTransitions is a prototype, so the timeline phase is too.
    expect(byPhase.get(13)!.status).toBe('PROTOTYPE');
  });

  it('reports a non-null active phase because not everything is finished', () => {
    const report = phaseReport();
    expect(report.activePhase).not.toBeNull();
    expect(report.nextProductionWork.length).toBeGreaterThan(0);
  });

  it('keeps counts consistent with the phase list', () => {
    const report = phaseReport(START_MD_PHASES);
    const counted = Object.values(report.counts).reduce((sum, value) => sum + value, 0);

    expect(counted).toBe(report.total);
  });

  it('declared statuses are consistent with the derived statuses', () => {
    for (const phase of START_MD_PHASES) {
      const derived = phaseReport([phase]).phases[0];
      expect(derived.status).toBe(phase.status);
    }
  });

  it('references only known capability keys', () => {
    const capabilities = new Set(Object.keys(CAPABILITY_MATRIX));
    const unknown = START_MD_PHASES.flatMap((phase) =>
      phase.requiredCapabilities.filter((key) => !capabilities.has(key)),
    );

    expect(unknown).toEqual([]);
  });
});
