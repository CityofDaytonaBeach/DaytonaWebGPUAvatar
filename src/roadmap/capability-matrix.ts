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

export const CAPABILITY_STATUSES = ['IMPLEMENTED', 'PARTIAL', 'PROTOTYPE', 'PLANNED'] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

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
  motionCompiler: 'PROTOTYPE',
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
  parameterTransitions: 'PROTOTYPE',
  snapshotRestore: 'IMPLEMENTED',
  undoRedo: 'IMPLEMENTED',

  // GPU / performance.
  gpuScheduler: 'IMPLEMENTED',
  gpuMorphCompute: 'IMPLEMENTED',
  localizedEditBenchmark: 'PROTOTYPE',
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
} as const satisfies Record<string, CapabilityStatus>;

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

export function capabilityReport(): CapabilityReport {
  const counts: Record<CapabilityStatus, number> = {
    IMPLEMENTED: 0,
    PARTIAL: 0,
    PROTOTYPE: 0,
    PLANNED: 0,
  };
  const entries: CapabilityEntry[] = Object.entries(CAPABILITY_MATRIX).map(([name, status]) => {
    const typedStatus: CapabilityStatus = status;
    counts[typedStatus] += 1;
    return {
      name: name as Capability,
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
export function capabilityStatus(name: string): CapabilityStatus | undefined {
  return CAPABILITY_MATRIX[name as Capability];
}
