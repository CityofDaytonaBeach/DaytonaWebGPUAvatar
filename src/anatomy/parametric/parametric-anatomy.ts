import { HumanDefinition } from '../../core/schema/human-definition';

/**
 * Concrete, measured body dimensions resolved from the semantic Human
 * Definition. This is the anatomical-constraint side of the pipeline: it turns
 * high-level identity properties (height, muscularity, bodyFat, limb-length and
 * torso girth factors) into real, closable body & joint metrics that both the
 * canonical geometry (reparemeterized) and the parametric skeleton share.
 */
export interface AnatomyDimensions {
  height: number;
  scale: number;
  // --- Trunk ---
  hipHeight: number;
  shoulderHeight: number;
  chestY: number;
  waistY: number;
  pelvisY: number;
  // --- Girths (half-widths / half-depths) ---
  chestHalfWidth: number;
  waistHalfWidth: number;
  hipHalfWidth: number;
  torsoHalfDepth: number;
  // --- Shoulders / limbs ---
  shoulderHalfWidth: number;
  upperarmLength: number;
  forearmLength: number;
  handLength: number;
  thighLength: number;
  shinLength: number;
  footOffsetY: number;
  // --- Face / head scale ---
  headScale: number;
}

export interface AnatomyConstraint {
  message: string;
  satisfaction: number; // 0..1
}

export const NEUTRAL_US_MALE_HEIGHT = 1.78;

/**
 * Resolve concrete anatomy dimensions from a Human Definition.
 *
 * The solver is deterministic and purely functional: same definition -> same
 * dimensions. All factors default to 1.0 at neutral so a default human maps to
 * the canonical reference geometry, and corrective morphs (registered in Human)
 * deform that geometry to match these resolved values.
 */
export function resolveAnatomy(def: HumanDefinition): AnatomyDimensions {
  const height = def.get('global.height');
  const scale = def.get('global.scale');
  const muscularity = def.get('body.muscularity'); // 0..1
  const bodyFat = def.get('body.bodyFat'); // 0.02..0.6
  const chestF = def.get('body.chest');
  const waistF = def.get('body.waist');
  const hipsF = def.get('body.hips');
  const neckF = def.get('skeleton.neckLength');
  const spineF = def.get('skeleton.spineLength');
  const shF = def.get('skeleton.shoulderWidth');
  const armF = def.get('skeleton.armLength');
  const legF = def.get('skeleton.legLength');

  const hipHeight = height * 0.53;
  const spineHeight = height * 0.16 * spineF;
  const neckHeight = height * 0.06 * neckF;
  const shoulderHeight = hipHeight + spineHeight + neckHeight;

  // Torso girths: neutral widths then scaled by body shape factors.
  const leanFactor = 1 / (1 + bodyFat * 0.6); // larger fat -> softer/rounder
  const chestBase = 0.17 * height * chestF * (1 + muscularity * 0.18) * (1 + bodyFat * 0.25);
  const waistBase = 0.15 * height * waistF * (1 + bodyFat * 0.85) * (1 - muscularity * 0.12);
  const hipBase = 0.16 * height * hipsF * (1 + bodyFat * 0.4) * (1 + muscularity * 0.08);
  const depthBase = 0.11 * height * (0.85 + 0.3 * bodyFat * (1 - leanFactor / 2));

  return {
    height: height * scale,
    scale,
    hipHeight,
    shoulderHeight,
    chestY: hipHeight + spineHeight * 0.85,
    waistY: hipHeight + spineHeight * 0.45,
    pelvisY: hipHeight * 0.4,
    chestHalfWidth: chestBase * 0.9,
    waistHalfWidth: waistBase,
    hipHalfWidth: hipBase,
    torsoHalfDepth: depthBase,
    shoulderHalfWidth: 0.17 * height * shF * (1 + muscularity * 0.1) * (1 + bodyFat * 0.08),
    upperarmLength: height * 0.1 * armF,
    forearmLength: height * 0.085 * armF,
    handLength: height * 0.05,
    thighLength: height * 0.14 * legF,
    shinLength: height * 0.135 * legF,
    footOffsetY: height * 0.035,
    headScale: def.get('identity.headProportion'),
  };
}

/**
 * Validate resolved anatomy against anatomical plausibility constraints.
 * Returns a satisfaction 0..1 and messages; used by the constraint solver as a
 * knowledge-driven check (e.g. waist must not exceed chest).
 */
export function validateAnatomy(d: AnatomyDimensions): AnatomyConstraint[] {
  const out: AnatomyConstraint[] = [];
  if (d.waistHalfWidth > d.chestHalfWidth) {
    out.push({
      message: 'waist exceeds chest',
      satisfaction: Math.max(0.2, 1 - (d.waistHalfWidth / d.chestHalfWidth - 1) * 4),
    });
  } else {
    out.push({ message: 'waist < chest', satisfaction: 1 });
  }
  if (d.hipHalfWidth < d.chestHalfWidth * 0.7) {
    out.push({ message: 'hips too narrow for trunk', satisfaction: 0.6 });
  } else {
    out.push({ message: 'hips proportional', satisfaction: 1 });
  }
  const torsoDepthOk = d.torsoHalfDepth > 0 && d.torsoHalfDepth < d.chestHalfWidth * 0.9;
  out.push({
    message: torsoDepthOk ? 'torso depth proportional' : 'torso depth implausible',
    satisfaction: torsoDepthOk ? 1 : 0.4,
  });
  out.push({ message: 'resolve successful', satisfaction: 1 });
  return out;
}

/** Aggregate satisfaction across all anatomy constraints. */
export function anatomySatisfaction(constraints: AnatomyConstraint[]): number {
  if (constraints.length === 0) return 1;
  return constraints.reduce((s, c) => s + c.satisfaction, 0) / constraints.length;
}
