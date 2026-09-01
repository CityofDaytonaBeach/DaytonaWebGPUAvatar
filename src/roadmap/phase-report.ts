export const PHASE_STATUSES = ["COMPLETE", "IN_PROGRESS", "PROTOTYPE", "PLANNED", "BLOCKED"] as const;
export type PhaseStatus = typeof PHASE_STATUSES[number];

export interface PhaseMilestone {
  phase: number;
  title: string;
  status: PhaseStatus;
  requiredCapabilities: string[];
  productionExitCriteria: string[];
  nextWork: string[];
}

export interface PhaseReport {
  total: number;
  counts: Record<PhaseStatus, number>;
  phases: PhaseMilestone[];
  activePhase: PhaseMilestone | null;
  nextProductionWork: string[];
}

export const START_MD_PHASES: PhaseMilestone[] = [
  phase(0, "Audit and architecture", "COMPLETE", ["phaseTracking"], ["repository audited", "implementation map exists"], []),
  phase(1, "Minimum human compiler", "IN_PROGRESS", ["schemaCompiler", "propertyIds", "gpuParameterBuffer", "dependencyGraph", "affectedSystemDiagnostics", "deltaCompiler", "vertexRangeCompilation", "gpuMorphCompute", "sparseMorph", "localizedEditBenchmark", "gpuTimestampBenchmark", "timelineDirtyReporting", "nonPropertyEventDirtyReporting"], ["generated schema artifacts", "CPU/GPU layout validation", "localized nose edit benchmark", "undo exactness proof"], ["validate full Phase 1 suite once Node is available", "promote Phase 1 to complete after runtime test pass"]),
  phase(2, "Canonical human", "PROTOTYPE", ["canonicalHuman", "canonicalValidation", "canonicalAssetAdapter", "canonicalParts"], ["licensed or original canonical topology", "stable vertex IDs", "face loops", "UV/surface coordinates", "replaceable asset boundary"], ["replace block human with production canonical topology interface"]),
  phase(3, "Anatomical system", "PROTOTYPE", ["parametricAnatomy", "constraintSolver", "internalAnatomyModes"], ["joint placement validated across body ranges", "hard/soft constraints tested", "corrective deformation coverage"], ["expand anatomical constraint coverage", "add extreme-combination tests"]),
  phase(4, "Identity", "IN_PROGRESS", ["identitySolver"], ["identity vector and masks", "identity budgets on all structural events", "non-identity edits proven stable"], ["add explicit identity snapshot/diff report"]),
  phase(5, "Facial system", "IN_PROGRESS", ["facialExpression"], ["standard control vocabulary", "semantic expressions", "expression/identity separation tests"], ["expand ARKit-compatible control mapping"]),
  phase(6, "Speech", "PROTOTYPE", ["speechVisemes"], ["phoneme timing adapter", "co-articulation", "expression blending", "TTS adapter boundary"], ["add provider-independent TTS adapter interface"]),
  phase(7, "Motion", "PROTOTYPE", ["skeletalAnimation", "motionCompiler"], ["IK", "look-at", "gesture layering", "retargeting", "walk/stop/wave demo"], ["implement IK/look-at solver"]),
  phase(8, "Surface systems", "PROTOTYPE", ["tattooDecals", "neuralSkin", "attachmentCoordinates"], ["rendered tattoos/scars/makeup", "procedural pores/wrinkles", "attachment deformation tests"], ["integrate tattoo decals into renderer"]),
  phase(9, "Hair and clothing", "PROTOTYPE", ["strandHair", "clothingGeometry", "clothPhysics"], ["rendered hair/cards or strands", "separate garment rendering", "cloth collision integration"], ["connect hair and garment meshes to render path"]),
  phase(10, "SDF collision", "PROTOTYPE", ["sdfCollision"], ["collision usefulness benchmark", "LOD-dependent fields", "hair/cloth integration"], ["benchmark SDF against simpler capsule collision"]),
  phase(11, "Semantic and perceptual LOD", "PROTOTYPE", ["semanticLod", "perceptualLod"], ["camera-dependent quality redistribution", "smooth transitions", "no visible popping"], ["add renderer-visible LOD transitions"]),
  phase(12, "GPU scheduler", "IN_PROGRESS", ["gpuScheduler"], ["GPU timing integration", "adaptive quality", "frame pacing target"], ["wire timestamp-query measurements where available"]),
  phase(13, "Timeline and automation", "IN_PROGRESS", ["timelineEventSourcing", "parameterTransitions", "snapshotRestore", "undoRedo"], ["deterministic long replay", "timeline scrub demo", "branch/restore coverage"], ["add long-horizon replay benchmark"]),
  phase(14, "Advanced R&D", "PLANNED", ["neuralSkin"], ["baseline comparisons", "measured quality/performance benefit", "portable fallback"], ["defer until production foundation is stable"]),
];

export function phaseReport(phases: readonly PhaseMilestone[] = START_MD_PHASES): PhaseReport {
  const counts: Record<PhaseStatus, number> = { COMPLETE: 0, IN_PROGRESS: 0, PROTOTYPE: 0, PLANNED: 0, BLOCKED: 0 };
  const ordered = [...phases].sort((a, b) => a.phase - b.phase);
  for (const item of ordered) counts[item.status] += 1;
  const activePhase = ordered.find((item) => item.status === "IN_PROGRESS" || item.status === "PROTOTYPE" || item.status === "BLOCKED") ?? null;
  return {
    total: ordered.length,
    counts,
    phases: ordered,
    activePhase,
    nextProductionWork: activePhase?.nextWork ?? [],
  };
}

function phase(
  phaseNumber: number,
  title: string,
  status: PhaseStatus,
  requiredCapabilities: string[],
  productionExitCriteria: string[],
  nextWork: string[]
): PhaseMilestone {
  return { phase: phaseNumber, title, status, requiredCapabilities, productionExitCriteria, nextWork };
}
