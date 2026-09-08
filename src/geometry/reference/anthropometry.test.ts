import { describe, it, expect } from 'vitest';
import {
  ADULT_FEMALE_FACE_MM,
  ADULT_MALE_FACE_MM,
  ADULT_NEUTRAL_FACE_MM,
  FACE_CANONS,
  evaluateFaceProportions,
  faceMeansFor,
  gateLandmarkProportions,
  measureFromLandmarks,
  resolveFaceMeasurements,
  type LandmarkPositions,
} from './anthropometry.js';

describe('anthropometry reference', () => {
  it('published population means satisfy every neoclassical canon', () => {
    for (const means of [ADULT_MALE_FACE_MM, ADULT_FEMALE_FACE_MM, ADULT_NEUTRAL_FACE_MM]) {
      const report = evaluateFaceProportions(means);
      expect(report.failures.map((f) => f.canon.id)).toEqual([]);
      expect(report.pass).toBe(true);
      expect(report.score).toBe(1);
    }
  });

  it('selects the requested population table', () => {
    expect(faceMeansFor('male')).toBe(ADULT_MALE_FACE_MM);
    expect(faceMeansFor('female')).toBe(ADULT_FEMALE_FACE_MM);
    expect(faceMeansFor('neutral')).toBe(ADULT_NEUTRAL_FACE_MM);
  });

  it('resolves to metres and scales isometrically', () => {
    const base = resolveFaceMeasurements({ sex: 'male' });
    expect(base.headHeight).toBeCloseTo(0.232, 6);

    const scaled = resolveFaceMeasurements({ sex: 'male', headHeightM: 0.116 });
    expect(scaled.headHeight).toBeCloseTo(0.116, 6);
    // Every measurement halves; ratios — and therefore the canons — are preserved.
    expect(scaled.noseLength / base.noseLength).toBeCloseTo(0.5, 6);
    expect(evaluateFaceProportions(scaled).pass).toBe(true);
  });

  it('is deterministic', () => {
    expect(resolveFaceMeasurements({ sex: 'female', headHeightM: 0.21 })).toEqual(
      resolveFaceMeasurements({ sex: 'female', headHeightM: 0.21 }),
    );
  });

  it('catches the exact failures the hand-sculpted face had', () => {
    const overLongNose = { ...ADULT_MALE_FACE_MM, noseLength: 90 };
    const noseReport = evaluateFaceProportions(overLongNose);
    expect(noseReport.pass).toBe(false);
    expect(noseReport.failures.map((f) => f.canon.id)).toContain('nose-thirds');

    const weakJaw = { ...ADULT_MALE_FACE_MM, jawWidth: 78 };
    expect(evaluateFaceProportions(weakJaw).failures.map((f) => f.canon.id)).toContain(
      'jaw-to-face-width',
    );

    const wideEyes = { ...ADULT_MALE_FACE_MM, intercanthalWidth: 55 };
    expect(evaluateFaceProportions(wideEyes).failures.map((f) => f.canon.id)).toContain(
      'intercanthal-equals-nose-width',
    );
  });

  it('reports missing landmarks as failures rather than passing silently', () => {
    const report = gateLandmarkProportions({});
    expect(report.pass).toBe(false);
    expect(report.failures.length).toBe(FACE_CANONS.length);
  });

  it('derives measurements from a landmark cloud', () => {
    const p: LandmarkPositions = {
      nasion: [0, 1.9, 0.09],
      subnasale: [0, 1.847, 0.1],
      alare_left: [-0.0175, 1.85, 0.085],
      alare_right: [0.0175, 1.85, 0.085],
      cheilion_left: [-0.0265, 1.825, 0.08],
      cheilion_right: [0.0265, 1.825, 0.08],
    };
    const m = measureFromLandmarks(p);
    expect(m.noseWidth).toBeCloseTo(0.035, 4);
    expect(m.mouthWidth).toBeCloseTo(0.053, 4);
    // Mouth-to-nose-width canon holds on real spacing.
    expect(m.mouthWidth / m.noseWidth).toBeCloseTo(1.514, 2);
    expect(Number.isNaN(m.headHeight)).toBe(true);
  });
});
