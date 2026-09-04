import { combinedSkinMatrices } from './bone-matrix.js';
import { adaptSkeletonToPositions, boneWorldPositions, skeletonAdaptationReportLines, } from './skeleton-adaptation.js';
import { applySkinWeights, solveSkinWeights, validateSkinWeights, } from './skin-weight-solver.js';
/** Apply a flat xyz delta array to a base mesh, producing world positions. */
export function deformedPositions(base, delta) {
    const { positions } = base.baseGeometry();
    if (!delta)
        return positions;
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
export function bindPoseError(bones) {
    const matrices = combinedSkinMatrices(bones);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    let worst = 0;
    for (let b = 0; b < bones.length; b++) {
        for (let i = 0; i < 16; i++) {
            const diff = Math.abs(matrices[b * 16 + i] - identity[i]);
            if (diff > worst)
                worst = diff;
        }
    }
    return worst;
}
export class RigAdapter {
    base;
    restBones;
    options;
    constructor(base, restBones, options = {}) {
        this.base = base;
        this.restBones = restBones;
        this.options = options;
    }
    /** Rest joint positions in world space (diagnostics / comparisons). */
    restWorld() {
        return boneWorldPositions(this.restBones);
    }
    /** Adapt against an explicit deformation delta (vertexCount * 3 floats). */
    adaptToDelta(delta) {
        return this.adaptToPositions(deformedPositions(this.base, delta));
    }
    /** Adapt against the current coefficients of a shape space. */
    adaptToShapeSpace(space) {
        return this.adaptToDelta(space.evaluate());
    }
    /** Adapt against already-deformed positions. */
    adaptToPositions(positions) {
        const { bones, report } = adaptSkeletonToPositions(this.restBones, this.base, positions, this.options);
        let weights = null;
        let skinning = null;
        let validation = null;
        if (!this.options.skipWeights) {
            const solved = solveSkinWeights(this.base, bones, positions, this.options.weights ?? {});
            weights = solved.weights;
            skinning = solved.report;
            validation = validateSkinWeights(this.base, bones, solved.weights, this.options.weights?.maxInfluences ?? 4);
            if (this.options.applyToMesh)
                applySkinWeights(this.base, solved.weights);
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
    static describe(result) {
        const lines = skeletonAdaptationReportLines(result.skeleton);
        if (result.skinning) {
            lines.push(`skinning: vertices=${result.skinning.vertices} bones=${result.skinning.bonesUsed} meanInfluences=${result.skinning.meanInfluences.toFixed(2)}`);
        }
        if (result.validation) {
            lines.push(`validation: ${result.validation.ok ? 'ok' : result.validation.issues.join('; ')}`);
        }
        lines.push(`bindPoseStable=${result.bindPoseStable} maxBindError=${result.maxBindError.toExponential(2)}`);
        return lines;
    }
}
//# sourceMappingURL=rig-adaptation.js.map