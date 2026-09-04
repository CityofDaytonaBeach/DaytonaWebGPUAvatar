import { capabilityStatus } from './capability-matrix.js';
export const PHASE_STATUSES = [
    'COMPLETE',
    'IN_PROGRESS',
    'PROTOTYPE',
    'PLANNED',
    'BLOCKED',
];
/**
 * Derive a phase's honest status from its required capabilities.
 *
 * A phase is only COMPLETE when every required capability is IMPLEMENTED. If any
 * required capability is PLANNED the phase is PLANNED; if any is PROTOTYPE it is
 * PROTOTYPE; if any is PARTIAL (and nothing worse) it is IN_PROGRESS. This keeps
 * the phase report consistent with the capability matrix — a phase can never
 * appear finished while one of its required systems is still a prototype.
 */
export function derivePhaseStatus(required) {
    let hasPartial = false;
    for (const cap of required) {
        const s = capabilityStatus(cap);
        if (s === 'PLANNED')
            return 'PLANNED';
        if (s === 'PROTOTYPE')
            return 'PROTOTYPE';
        if (s === 'PARTIAL')
            hasPartial = true;
        // unknown capability keys do not force an upgrade; they are validated by tests.
    }
    return hasPartial ? 'IN_PROGRESS' : 'COMPLETE';
}
export const START_MD_PHASES = [
    phase(0, 'Audit and architecture', 'COMPLETE', ['phaseTracking'], ['repository audited', 'implementation map exists'], []),
    phase(1, 'Minimum human compiler', 'PROTOTYPE', [
        'schemaCompiler',
        'propertyIds',
        'gpuParameterBuffer',
        'dependencyGraph',
        'affectedSystemDiagnostics',
        'deltaCompiler',
        'vertexRangeCompilation',
        'gpuMorphCompute',
        'sparseMorph',
        'localizedEditBenchmark',
        'gpuTimestampBenchmark',
        'timelineDirtyReporting',
        'nonPropertyEventDirtyReporting',
    ], [
        'generated schema artifacts',
        'CPU/GPU layout validation',
        'localized nose edit benchmark',
        'undo exactness proof',
    ], [
        'graduate localized + GPU timestamp benchmarks from prototype',
        'fix failing pose-corrective / shape-space tests',
    ]),
    phase(2, 'Canonical human', 'IN_PROGRESS', ['canonicalHuman', 'canonicalValidation', 'canonicalAssetAdapter', 'canonicalParts'], [
        'licensed or original canonical topology',
        'stable vertex IDs',
        'face loops',
        'UV/surface coordinates',
        'replaceable asset boundary',
    ], ['replace procedural block default with Daytona HD canonical topology']),
    phase(3, 'Anatomical system', 'PROTOTYPE', ['parametricAnatomy', 'constraintSolver', 'internalAnatomyModes'], [
        'joint placement validated across body ranges',
        'hard/soft constraints tested',
        'corrective deformation coverage',
    ], ['graduate internal anatomy view modes from prototype; expand corrective coverage']),
    phase(4, 'Identity', 'COMPLETE', ['identitySolver'], [
        'identity vector and masks',
        'identity budgets on all structural events',
        'non-identity edits proven stable',
    ], []),
    phase(5, 'Facial system', 'COMPLETE', ['facialExpression'], ['standard control vocabulary', 'semantic expressions', 'expression/identity separation tests'], []),
    phase(6, 'Speech', 'COMPLETE', ['speechVisemes'], ['phoneme timing adapter', 'co-articulation', 'expression blending', 'TTS adapter boundary'], []),
    phase(7, 'Motion', 'PROTOTYPE', ['skeletalAnimation', 'motionCompiler'], ['IK', 'look-at', 'gesture layering', 'retargeting', 'walk/stop/wave demo'], ['implement IK, look-at, gesture layering; retire motion from prototype']),
    phase(8, 'Surface systems', 'PROTOTYPE', ['tattooDecals', 'neuralSkin', 'attachmentCoordinates'], ['rendered tattoos/scars/makeup', 'procedural pores/wrinkles', 'attachment deformation tests'], ['render decals + procedural skin detail; graduate tattoo/neural-skin from prototype']),
    phase(9, 'Hair and clothing', 'PROTOTYPE', ['strandHair', 'clothingGeometry', 'clothPhysics'], ['rendered hair/cards or strands', 'separate garment rendering', 'cloth collision integration'], ['render separate garments + hair; integrate cloth collision']),
    phase(10, 'SDF collision', 'PROTOTYPE', ['sdfCollision'], ['collision usefulness benchmark', 'LOD-dependent fields', 'hair/cloth integration'], ['benchmark collision usefulness; integrate with hair/cloth']),
    phase(11, 'Semantic and perceptual LOD', 'COMPLETE', ['semanticLod', 'perceptualLod'], ['camera-dependent quality redistribution', 'smooth transitions', 'no visible popping'], []),
    phase(12, 'GPU scheduler', 'COMPLETE', ['gpuScheduler'], ['GPU timing integration', 'adaptive quality', 'frame pacing target'], []),
    phase(13, 'Timeline and automation', 'PROTOTYPE', ['timelineEventSourcing', 'parameterTransitions', 'snapshotRestore', 'undoRedo'], ['deterministic long replay', 'timeline scrub demo', 'branch/restore coverage'], ['graduate parameter transitions from prototype and prove deterministic long replay']),
    phase(14, 'Advanced R&D', 'PROTOTYPE', ['neuralSkin'], ['baseline comparisons', 'measured quality/performance benefit', 'portable fallback'], ['add baseline comparisons + portable fallback to neural skin']),
];
export function phaseReport(phases = START_MD_PHASES) {
    const counts = {
        COMPLETE: 0,
        IN_PROGRESS: 0,
        PROTOTYPE: 0,
        PLANNED: 0,
        BLOCKED: 0,
    };
    const ordered = [...phases].sort((a, b) => a.phase - b.phase);
    const derived = ordered.map((item) => ({
        ...item,
        status: derivePhaseStatus(item.requiredCapabilities),
    }));
    for (const item of derived)
        counts[item.status] += 1;
    const activePhase = derived.find((item) => item.status === 'IN_PROGRESS' || item.status === 'PROTOTYPE' || item.status === 'BLOCKED') ?? null;
    return {
        total: derived.length,
        counts,
        phases: derived,
        activePhase,
        nextProductionWork: activePhase?.nextWork ?? [],
    };
}
function phase(phaseNumber, title, status, requiredCapabilities, productionExitCriteria, nextWork) {
    return {
        phase: phaseNumber,
        title,
        status,
        requiredCapabilities,
        productionExitCriteria,
        nextWork,
    };
}
//# sourceMappingURL=phase-report.js.map