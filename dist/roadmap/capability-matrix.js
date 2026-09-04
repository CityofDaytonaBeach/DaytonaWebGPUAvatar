/**
 * The Daytona capability matrix — the single source of truth for what the SDK
 * actually does.
 *
 * This module exists so `index` (public API) and `roadmap/phase-report` (phase
 * tracking) can both consume the same honest status map without a circular
 * import. Per start.md "No Placeholder Success", a subsystem whose runtime is a
 * prototype (or only partially integrated) must be labelled PROTOTYPE / PARTIAL,
 * never IMPLEMENTED.
 *
 * Status meaning:
 *   IMPLEMENTED  — integrated, validated, benchmarked, production-shaped.
 *   PARTIAL      — core path exists but a documented contract/exit criterion is
 *                  unproven or unfinished (e.g. quality or integration gap).
 *   PROTOTYPE    — a deterministic runtime exists but is not yet integrated into
 *                  the GPU/renderer path or lacks validation/benchmarks.
 *   PLANNED      — designed but not yet built.
 */
export const CAPABILITY_STATUSES = ['IMPLEMENTED', 'PARTIAL', 'PROTOTYPE', 'PLANNED'];
export const CAPABILITY_MATRIX = {
    // Core semantic + compiler pipeline (production-shaped).
    schemaCompiler: 'IMPLEMENTED',
    propertyIds: 'IMPLEMENTED',
    gpuParameterBuffer: 'IMPLEMENTED',
    dependencyGraph: 'IMPLEMENTED',
    affectedSystemDiagnostics: 'IMPLEMENTED',
    deltaCompiler: 'IMPLEMENTED',
    vertexRangeCompilation: 'IMPLEMENTED',
    sparseMorph: 'IMPLEMENTED',
    identitySolver: 'IMPLEMENTED',
    constraintSolver: 'IMPLEMENTED',
    // Canonical human: the runtime + adapter/validation/parts are IMPLEMENTED, the
    // body is a CLEAN-MANIFOLD parametric HD mesh (SDF union -> single watertight
    // marching-cubes surface, non-self-overlapping at rest; P22 hard body-region
    // gate pairs == 0), and the head is the HD parametric skin with inverse-distance
    // weight gradients. Production topology decision (direction.md P22): head,
    // eyes, and teeth are accepted as separate authored shells layered over the
    // unified body (like eyelid-over-eye) rather than a single fused manifold.
    canonicalHuman: 'IMPLEMENTED',
    canonicalValidation: 'IMPLEMENTED',
    canonicalAssetAdapter: 'IMPLEMENTED',
    canonicalParts: 'IMPLEMENTED',
    // Anatomy, rig, animation.
    skeleton: 'IMPLEMENTED',
    parametricAnatomy: 'IMPLEMENTED',
    internalAnatomyModes: 'PROTOTYPE',
    skeletalAnimation: 'IMPLEMENTED',
    // Motion + IK is now complete: FK evaluator (kinematics.ts), FABRIK chain/limb
    // IK with pole vectors and joint limits, FK-verified look-at, and rest-relative
    // retargeting — all layered into MotionRuntime and covered by deterministic,
    // FK-measured tests instead of the earlier heuristic recipes.
    motionCompiler: 'IMPLEMENTED',
    // Motion runtime: compiler now drives the animation frame loop (cross-fade,
    // walk phase, rejection) and is covered by deterministic tests.
    motionRuntime: 'IMPLEMENTED',
    gpuSkinning: 'IMPLEMENTED',
    // Surface / attachments (runtime prototypes, not yet production-rendered).
    attachmentCoordinates: 'IMPLEMENTED',
    tattooDecals: 'PROTOTYPE',
    clothingGeometry: 'PROTOTYPE',
    // Facial + speech (production-shaped: co-articulation + expression blending).
    facialExpression: 'IMPLEMENTED',
    speechVisemes: 'IMPLEMENTED',
    // Timeline / history.
    timelineEventSourcing: 'IMPLEMENTED',
    timelineDirtyReporting: 'IMPLEMENTED',
    nonPropertyEventDirtyReporting: 'IMPLEMENTED',
    // Transitions are validated frame-by-frame through the real GPU morph
    // packing/dispatch path (transitionGpuValidation), plus deterministic long
    // replay (10 simulated minutes at 120Hz, two identical passes, exact settle)
    // and order-independent timeline scrubbing — the phase-13 exit criteria.
    parameterTransitions: 'IMPLEMENTED',
    transitionGpuValidation: 'IMPLEMENTED',
    snapshotRestore: 'IMPLEMENTED',
    undoRedo: 'IMPLEMENTED',
    // GPU / performance.
    gpuScheduler: 'IMPLEMENTED',
    gpuMorphCompute: 'IMPLEMENTED',
    gpuValidationHarness: 'IMPLEMENTED',
    // Benchmarks are CI-enforced: absolute per-case budgets + baseline regression
    // gates, failing the job on violation.
    localizedEditBenchmark: 'IMPLEMENTED',
    benchmarkGates: 'IMPLEMENTED',
    gpuTimestampBenchmark: 'PROTOTYPE',
    // LOD / validation.
    semanticLod: 'IMPLEMENTED',
    perceptualLod: 'IMPLEMENTED',
    perceptualValidation: 'PROTOTYPE',
    // Renderer.
    gpuRenderer: 'IMPLEMENTED',
    webglFallback: 'IMPLEMENTED',
    // Physics / simulation runtime prototypes.
    strandHair: 'PROTOTYPE',
    clothPhysics: 'PROTOTYPE',
    sdfCollision: 'PROTOTYPE',
    neuralSkin: 'PROTOTYPE',
    phaseTracking: 'IMPLEMENTED',
};
export function capabilityReport() {
    const counts = {
        IMPLEMENTED: 0,
        PARTIAL: 0,
        PROTOTYPE: 0,
        PLANNED: 0,
    };
    const entries = Object.entries(CAPABILITY_MATRIX).map(([name, status]) => {
        const typedStatus = status;
        counts[typedStatus] += 1;
        return {
            name: name,
            status: typedStatus,
            productionReady: typedStatus === 'IMPLEMENTED',
        };
    });
    return {
        total: entries.length,
        counts,
        entries,
        implemented: entries.filter((e) => e.status === 'IMPLEMENTED').map((e) => e.name),
        prototypes: entries.filter((e) => e.status === 'PROTOTYPE').map((e) => e.name),
        planned: entries.filter((e) => e.status === 'PLANNED').map((e) => e.name),
    };
}
/** Look up the status of a single capability (used by the phase report). */
export function capabilityStatus(name) {
    return CAPABILITY_MATRIX[name];
}
//# sourceMappingURL=capability-matrix.js.map