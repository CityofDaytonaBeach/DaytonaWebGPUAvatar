import { describe, expect, it } from "vitest";
import { CAPABILITY_MATRIX } from "../index";
import { START_MD_PHASES, phaseReport } from "./phase-report";

describe("start.md phase report", () => {
  it("tracks every start.md development phase in order", () => {
    const report = phaseReport();

    expect(report.total).toBe(15);
    expect(report.phases.map((phase) => phase.phase)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("all phases are COMPLETE", () => {
    const report = phaseReport();

    expect(report.activePhase).toBeNull();
    expect(report.nextProductionWork).toHaveLength(0);
    expect(report.counts.COMPLETE).toBe(15);
    expect(report.counts.IN_PROGRESS).toBe(0);
    expect(report.counts.PROTOTYPE).toBe(0);
    expect(report.counts.PLANNED).toBe(0);
    expect(report.counts.BLOCKED).toBe(0);
  });

  it("keeps counts consistent with the phase list", () => {
    const report = phaseReport(START_MD_PHASES);
    const counted = Object.values(report.counts).reduce((sum, value) => sum + value, 0);

    expect(counted).toBe(report.total);
    expect(report.counts.COMPLETE).toBe(15);
  });

  it("references only known capability keys", () => {
    const capabilities = new Set(Object.keys(CAPABILITY_MATRIX));
    const unknown = START_MD_PHASES.flatMap((phase) => phase.requiredCapabilities.filter((key) => !capabilities.has(key)));

    expect(unknown).toEqual([]);
  });
});
