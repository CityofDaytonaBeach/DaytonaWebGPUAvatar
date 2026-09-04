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
export declare const CAPABILITY_STATUSES: readonly ["IMPLEMENTED", "PARTIAL", "PROTOTYPE", "PLANNED"];
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];
export declare const CAPABILITY_MATRIX: {
    readonly schemaCompiler: "IMPLEMENTED";
    readonly propertyIds: "IMPLEMENTED";
    readonly gpuParameterBuffer: "IMPLEMENTED";
    readonly dependencyGraph: "IMPLEMENTED";
    readonly affectedSystemDiagnostics: "IMPLEMENTED";
    readonly deltaCompiler: "IMPLEMENTED";
    readonly vertexRangeCompilation: "IMPLEMENTED";
    readonly sparseMorph: "IMPLEMENTED";
    readonly identitySolver: "IMPLEMENTED";
    readonly constraintSolver: "IMPLEMENTED";
    readonly canonicalHuman: "IMPLEMENTED";
    readonly canonicalValidation: "IMPLEMENTED";
    readonly canonicalAssetAdapter: "IMPLEMENTED";
    readonly canonicalParts: "IMPLEMENTED";
    readonly skeleton: "IMPLEMENTED";
    readonly parametricAnatomy: "IMPLEMENTED";
    readonly internalAnatomyModes: "PROTOTYPE";
    readonly skeletalAnimation: "IMPLEMENTED";
    readonly motionCompiler: "PROTOTYPE";
    readonly motionRuntime: "IMPLEMENTED";
    readonly gpuSkinning: "IMPLEMENTED";
    readonly attachmentCoordinates: "IMPLEMENTED";
    readonly tattooDecals: "PROTOTYPE";
    readonly clothingGeometry: "PROTOTYPE";
    readonly facialExpression: "IMPLEMENTED";
    readonly speechVisemes: "IMPLEMENTED";
    readonly timelineEventSourcing: "IMPLEMENTED";
    readonly timelineDirtyReporting: "IMPLEMENTED";
    readonly nonPropertyEventDirtyReporting: "IMPLEMENTED";
    readonly parameterTransitions: "PARTIAL";
    readonly transitionGpuValidation: "IMPLEMENTED";
    readonly snapshotRestore: "IMPLEMENTED";
    readonly undoRedo: "IMPLEMENTED";
    readonly gpuScheduler: "IMPLEMENTED";
    readonly gpuMorphCompute: "IMPLEMENTED";
    readonly gpuValidationHarness: "IMPLEMENTED";
    readonly localizedEditBenchmark: "IMPLEMENTED";
    readonly benchmarkGates: "IMPLEMENTED";
    readonly gpuTimestampBenchmark: "PROTOTYPE";
    readonly semanticLod: "IMPLEMENTED";
    readonly perceptualLod: "IMPLEMENTED";
    readonly perceptualValidation: "PROTOTYPE";
    readonly gpuRenderer: "IMPLEMENTED";
    readonly webglFallback: "IMPLEMENTED";
    readonly strandHair: "PROTOTYPE";
    readonly clothPhysics: "PROTOTYPE";
    readonly sdfCollision: "PROTOTYPE";
    readonly neuralSkin: "PROTOTYPE";
    readonly phaseTracking: "IMPLEMENTED";
};
export type Capability = keyof typeof CAPABILITY_MATRIX;
export interface CapabilityEntry {
    name: Capability;
    status: CapabilityStatus;
    productionReady: boolean;
}
export interface CapabilityReport {
    total: number;
    counts: Record<CapabilityStatus, number>;
    entries: CapabilityEntry[];
    implemented: Capability[];
    prototypes: Capability[];
    planned: Capability[];
}
export declare function capabilityReport(): CapabilityReport;
/** Look up the status of a single capability (used by the phase report). */
export declare function capabilityStatus(name: string): CapabilityStatus | undefined;
//# sourceMappingURL=capability-matrix.d.ts.map