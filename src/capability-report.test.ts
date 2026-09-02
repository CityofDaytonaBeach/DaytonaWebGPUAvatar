import { describe, expect, it } from 'vitest';
import { CAPABILITY_MATRIX, capabilityReport } from './index';

describe('capability report', () => {
  it('counts every matrix entry exactly once', () => {
    const report = capabilityReport();
    const counted = Object.values(report.counts).reduce((sum, value) => sum + value, 0);

    expect(report.total).toBe(Object.keys(CAPABILITY_MATRIX).length);
    expect(counted).toBe(report.total);
    expect(report.entries).toHaveLength(report.total);
  });

  it('all capabilities are production-ready (IMPLEMENTED)', () => {
    const report = capabilityReport();
    const nonImplemented = report.entries.filter((entry) => entry.status !== 'IMPLEMENTED');

    expect(nonImplemented).toHaveLength(0);
    expect(report.implemented).toHaveLength(report.total);
    expect(report.prototypes).toHaveLength(0);
    expect(report.planned).toHaveLength(0);
  });

  it('reports all systems as implemented', () => {
    const report = capabilityReport();

    expect(report.implemented).toContain('schemaCompiler');
    expect(report.implemented).toContain('canonicalHuman');
    expect(report.implemented).toContain('strandHair');
    expect(report.implemented).toContain('clothPhysics');
    expect(report.implemented).toContain('sdfCollision');
    expect(report.implemented).toContain('neuralSkin');
    expect(report.implemented).toContain('motionCompiler');
    expect(report.implemented).toContain('tattooDecals');
    expect(report.implemented).toContain('clothingGeometry');
    expect(report.implemented).toContain('parameterTransitions');
    expect(report.implemented).toContain('perceptualLod');
    expect(report.implemented).toContain('perceptualValidation');
    expect(report.implemented).toContain('internalAnatomyModes');
    expect(report.implemented).toContain('localizedEditBenchmark');
    expect(report.implemented).toContain('gpuTimestampBenchmark');
  });
});
