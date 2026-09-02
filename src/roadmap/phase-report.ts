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
  phase(1, "Minimum human compiler", "COMPLETE", ["schemaCompiler", "propertyIds", "gpuParameterBuffer", "dependencyGraph", "affectedSystemDiagnostics", "deltaCompiler", "vertexRangeCompilation", "gpuMorphCompute", "sparseMorph", "localizedEditBenchmark", "gpuTimestampBenchmark", "timelineDirtyReporting", "nonPropertyEventDirtyReporting"], ["generated schema artifacts", "CPU/GPU layout validation", "localized nose edit benchmark", "undo exactness proof"], []),
  phase(2, "Canonical human", "COMPLETE", ["canonicalHuman", "canonicalValidation", "canonicalAssetAdapter", "canonicalParts"], ["licensed or original canonical topology", "stable vertex IDs", "face loops", "UV/surface coordinates", "replaceable asset boundary"], []),
  phase(3, "Anatomical system", "COMPLETE", ["parametricAnatomy", "constraintSolver", "internalAnatomyModes"], ["joint placement validated across body ranges", "hard/soft constraints tested", "corrective deformation coverage"], []),
  phase(4, "Identity", "COMPLETE", ["identitySolver"], ["identity vector and masks", "identity budgets on all structural events", "non-identity edits proven stable"], []),
  phase(5, "Facial system", "COMPLETE", ["facialExpression"], ["standard control vocabulary", "semantic expressions", "expression/identity separation tests"], []),
  phase(6, "Speech", "COMPLETE", ["speechVisemes"], ["phoneme timing adapter", "co-articulation", "expression blending", "TTS adapter boundary"], []),
  phase(7, "Motion", "COMPLETE", ["skeletalAnimation", "motionCompiler"], ["IK", "look-at", "gesture layering", "retargeting", "walk/stop/wave demo"], []),
  phase(8, "Surface systems", "COMPLETE", ["tattooDecals", "neuralSkin", "attachmentCoordinates"], ["rendered tattoos/scars/makeup", "procedural pores/wrinkles", "attachment deformation tests"], []),
  phase(9, "Hair and clothing", "COMPLETE", ["strandHair", "clothingGeometry", "clothPhysics"], ["rendered hair/cards or strands", "separate garment rendering", "cloth collision integration"], []),
  phase(10, "SDF collision", "COMPLETE", ["sdfCollision"], ["collision usefulness benchmark", "LOD-dependent fields", "hair/cloth integration"], []),
  phase(11, "Semantic and perceptual LOD", "COMPLETE", ["semanticLod", "perceptualLod"], ["camera-dependent quality redistribution", "smooth transitions", "no visible popping"], []),
  phase(12, "GPU scheduler", "COMPLETE", ["gpuScheduler"], ["GPU timing integration", "adaptive quality", "frame pacing target"], []),
  phase(13, "Timeline and automation", "COMPLETE", ["timelineEventSourcing", "parameterTransitions", "snapshotRestore", "undoRedo"], ["deterministic long replay", "timeline scrub demo", "branch/restore coverage"], []),
  phase(14, "Advanced R&D", "COMPLETE", ["neuralSkin"], ["baseline comparisons", "measured quality/performance benefit", "portable fallback"], []),
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
