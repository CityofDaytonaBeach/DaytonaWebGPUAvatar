import { describe, expect, it } from 'vitest';
import { CAPABILITY_MATRIX, capabilityReport, Capability } from './index';

describe('capability report', () => {
  it('counts every matrix entry exactly once', () => {
    const report = capabilityReport();
    const counted = Object.values(report.counts).reduce((sum, value) => sum + value, 0);

    expect(report.total).toBe(Object.keys(CAPABILITY_MATRIX).length);
    expect(counted).toBe(report.total);
    expect(report.entries).toHaveLength(report.total);
  });

  it('marks prototype systems as PROTOTYPE (no placeholder success)', () => {
    const report = capabilityReport();
    const prototypes = new Set(report.prototypes);
    // Runtime prototypes that direction.md/start.md explicitly say are not yet
    // integrated/validated must never be reported as production-ready.
    for (const cap of [
      'motionCompiler',
      'strandHair',
      'clothPhysics',
      'sdfCollision',
      'neuralSkin',
      'tattooDecals',
      'clothingGeometry',
      'perceptualValidation',
      'internalAnatomyModes',
      'parameterTransitions',
      'localizedEditBenchmark',
      'gpuTimestampBenchmark',
    ]) {
      expect(prototypes.has(cap as Capability), `${cap} should be PROTOTYPE`).toBe(true);
      expect(CAPABILITY_MATRIX[cap as Capability]).toBe('PROTOTYPE');
    }
  });

  it('marks canonicalHuman as production (IMPLEMENTED after layered-model decision)', () => {
    const report = capabilityReport();
    const entry = report.entries.find((e) => e.name === 'canonicalHuman');
    expect(entry!.status).toBe('IMPLEMENTED');
    expect(entry!.productionReady).toBe(true);
  });

  it('reports speech as production-shaped (IMPLEMENTED)', () => {
    const report = capabilityReport();
    const speech = report.entries.find((e) => e.name === 'speechVisemes');
    expect(speech!.status).toBe('IMPLEMENTED');
    expect(speech!.productionReady).toBe(true);
  });

  it('production-ready (IMPLEMENTED) excludes all prototypes/partials', () => {
    const report = capabilityReport();
    for (const entry of report.entries) {
      if (entry.productionReady) {
        expect(entry.status).toBe('IMPLEMENTED');
      } else {
        expect(entry.status).not.toBe('IMPLEMENTED');
      }
    }
  });

  it('reports core implemented systems as implemented', () => {
    const report = capabilityReport();
    for (const cap of [
      'schemaCompiler',
      'canonicalValidation',
      'canonicalAssetAdapter',
      'canonicalParts',
      'skeletalAnimation',
      'gpuSkinning',
      'gpuRenderer',
      'webglFallback',
      'undoRedo',
      'timelineEventSourcing',
      'identitySolver',
      'speechVisemes',
    ]) {
      expect(report.implemented).toContain(cap);
      expect(report.entries.find((e) => e.name === cap)!.productionReady).toBe(true);
    }
  });
});
