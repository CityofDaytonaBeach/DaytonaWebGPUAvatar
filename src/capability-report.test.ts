import { describe, expect, it } from "vitest";
import { CAPABILITY_MATRIX, capabilityReport } from "./index";

describe("capability report", () => {
  it("counts every matrix entry exactly once", () => {
    const report = capabilityReport();
    const counted = Object.values(report.counts).reduce((sum, value) => sum + value, 0);

    expect(report.total).toBe(Object.keys(CAPABILITY_MATRIX).length);
    expect(counted).toBe(report.total);
    expect(report.entries).toHaveLength(report.total);
  });

  it("does not mark prototypes as production-ready", () => {
    const report = capabilityReport();
    const prototypes = report.entries.filter((entry) => entry.status === "PROTOTYPE");

    expect(prototypes.length).toBeGreaterThan(0);
    expect(prototypes.every((entry) => entry.productionReady === false)).toBe(true);
  });

  it("keeps implemented entries separate from prototype entries", () => {
    const report = capabilityReport();

    expect(report.implemented).toContain("schemaCompiler");
    expect(report.prototypes).toContain("canonicalHuman");
    expect(report.implemented).not.toContain("canonicalHuman");
  });
});
