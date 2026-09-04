import type { BoneDef } from './skeleton.js';
import type { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { HumanShapeSpace } from '../shape-space/human-shape-space.js';
import { combinedSkinMatrices } from './bone-matrix.js';
import {
  adaptSkeletonToPositions,
  boneWorldPositions,
  skeletonAdaptationReportLines,
  type SkeletonAdaptationOptions,
  type SkeletonAdaptationReport,
} from './skeleton-adaptation.js';
import {
  applySkinWeights,
  solveSkinWeights,
  validateSkinWeights,
  type SkinWeightOptions,
  type SkinWeightReport,
  type SkinWeightSet,
  type SkinWeightValidation,
} from './skin-weight-solver.js';

/**
 * Phase C — rig adaptation.
 *
 * Single entry point that makes the shape space *movable*: given a canonical
 * base mesh, its rest skeleton, and a set of shape coefficients, it produces
 *
 *   1. deformed vertex positions (linear shape space evaluation),
 *   2. a skeleton re-registered to those positions,
 *   3. skin weights rebound to that skeleton, and
 *   4. a validation report (bind-pose stability, weight budget, joint shifts).
 *
 * The existing FK/skinning path is untouched: the adapted skeleton is an
 * ordinary `BoneDef[]`, so `buildBoneMatrices`/`combinedSkinMatrices`,
 * `SkeletalAnimation`, and the GPU skinning pipeline consume it unchanged.
 */

export interface RigAdaptationOptions extends SkeletonAdaptationOptions {
  weights?: SkinWeightOptions;
  /** Skip weight rebinding (skeleton-only adaptation). */
  skipWeights?: boolean;
  /** Write the solved weights onto the mesh vertices. */
  applyToMesh?: boolean;
}

export interface RigAdaptationResult {
  bones: BoneDef[];
  positions: Float32Array;
  weights: SkinWeightSet | null;
  skeleton: SkeletonAdaptationReport;
  skinning: SkinWeightReport | null;
  validation: SkinWeightValidation | null;
  /** Rest pose still yields identity skin matrices (no drift at bind time). */
  bindPoseStable: boolean;
  maxBindError: number;
}

/** Apply a flat xyz delta array to a base mesh, producing world positions. */
export function deformedPositions(base: CanonicalHuman, delta?: Float32Array): Float32Array {
  const { positions } = base.baseGeometry();
  if (!delta) return positions;
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i++) {
    out[i] = positions[i] + (delta[i] ?? 0);
  }
  return out;
}

/**
 * Bind-pose check: at the rest pose every combined skin matrix must be the
 * identity, otherwise the adapted skeleton would shift the mesh the moment
 * skinning is enabled.
 */
export function bindPoseError(bones: BoneDef[]): number {
  const matrices = combinedSkinMatrices(bones);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  let worst = 0;
  for (let b = 0; b < bones.length; b++) {
    for (let i = 0; i < 16; i++) {
      const diff = Math.abs(matrices[b * 16 + i] - identity[i]);
      if (diff > worst) worst = diff;
    }
  }
  return worst;
}

export class RigAdapter {
  constructor(
    readonly base: CanonicalHuman,
    readonly restBones: BoneDef[],
    private readonly options: RigAdaptationOptions = {},
  ) {}

  /** Rest joint positions in world space (diagnostics / comparisons). */
  restWorld(): ReturnType<typeof boneWorldPositions> {
    return boneWorldPositions(this.restBones);
  }

  /** Adapt against an explicit deformation delta (vertexCount * 3 floats). */
  adaptToDelta(delta?: Float32Array): RigAdaptationResult {
    return this.adaptToPositions(deformedPositions(this.base, delta));
  }

  /** Adapt against the current coefficients of a shape space. */
  adaptToShapeSpace(space: HumanShapeSpace): RigAdaptationResult {
    return this.adaptToDelta(space.evaluate());
  }

  /** Adapt against already-deformed positions. */
  adaptToPositions(positions: Float32Array): RigAdaptationResult {
    const { bones, report } = adaptSkeletonToPositions(
      this.restBones,
      this.base,
      positions,
      this.options,
    );

    let weights: SkinWeightSet | null = null;
    let skinning: SkinWeightReport | null = null;
    let validation: SkinWeightValidation | null = null;
    if (!this.options.skipWeights) {
      const solved = solveSkinWeights(this.base, bones, positions, this.options.weights ?? {});
      weights = solved.weights;
      skinning = solved.report;
      validation = validateSkinWeights(
        this.base,
        bones,
        solved.weights,
        this.options.weights?.maxInfluences ?? 4,
      );
      if (this.options.applyToMesh) applySkinWeights(this.base, solved.weights);
    }

    const maxBindError = bindPoseError(bones);
    return {
      bones,
      positions,
      weights,
      skeleton: report,
      skinning,
      validation,
      bindPoseStable: maxBindError <= 1e-4,
      maxBindError,
    };
  }

  /** Deterministic textual report for CI/diagnostics. */
  static describe(result: RigAdaptationResult): string[] {
    const lines = skeletonAdaptationReportLines(result.skeleton);
    if (result.skinning) {
      lines.push(
        `skinning: vertices=${result.skinning.vertices} bones=${result.skinning.bonesUsed} meanInfluences=${result.skinning.meanInfluences.toFixed(2)}`,
      );
    }
    if (result.validation) {
      lines.push(
        `validation: ${result.validation.ok ? 'ok' : result.validation.issues.join('; ')}`,
      );
    }
    lines.push(
      `bindPoseStable=${result.bindPoseStable} maxBindError=${result.maxBindError.toExponential(2)}`,
    );
    return lines;
  }
}
