import { Human } from '../../human.js';
import { packSparseMorphs, setMorphWeights } from './gpu-morph-buffers.js';
import { GpuValidationHarness, validateComputeResources, validatePackedMorphBounds, } from '../device/gpu-validation-harness.js';
import { createParameterTransition, sampleTransition, } from '../../core/transitions/parameter-transition.js';
/** Bytes per packed delta quad (index, dx, dy, dz) — must match the kernel. */
const DELTA_STRIDE_BYTES = 16;
/** Bytes per packed morph meta struct (weight, count, offset, pad). */
const MORPH_STRIDE_BYTES = 16;
/**
 * Drive one parameter transition on a real Human and validate every frame's GPU
 * morph payload.
 */
export async function validateTransitionThroughGpuPath(human, spec, options = {}) {
    const fps = Math.max(1, options.fps ?? 60);
    const workgroupSize = options.workgroupSize ?? 64;
    const tolerance = options.tolerance ?? 1e-6;
    const dt = 1 / fps;
    const transition = createParameterTransition(human.definitionRef, { ...spec, id: spec.id ?? `${spec.path}-validation` }, 0);
    // Install the transition on the timeline exactly as an application would.
    human.transition(spec.path, Number(spec.targetValue), spec.duration, spec.curve ?? 'linear', 'automation');
    const canonical = human.canonicalRef;
    const vertexCount = canonical.vertexCount;
    const harness = options.device ? new GpuValidationHarness(options.device) : null;
    const frames = [];
    const issues = [];
    const totalFrames = Math.max(1, Math.ceil(spec.duration * fps));
    for (let frame = 1; frame <= totalFrames; frame++) {
        human.advanceTime(dt, 'simulation');
        const time = frame * dt;
        const sampled = Number(sampleTransition(transition, time));
        const applied = human.get(spec.path);
        const morphDelta = human.computeMorphDelta();
        let finite = morphDelta.length === vertexCount * 3;
        for (let i = 0; i < morphDelta.length; i++) {
            if (!Number.isFinite(morphDelta[i])) {
                finite = false;
                break;
            }
        }
        // What the GPU would actually be handed this frame.
        const packed = packSparseMorphs([...human.morphsRef.byName.values()]);
        setMorphWeights(packed.morphStruct, packed.morphOrder, new Map([[spec.path, applied]]));
        const deltaSlots = packed.deltaPacked.length / 4;
        const morphCount = packed.morphOrder.length;
        const frameReports = [
            validatePackedMorphBounds(`transition:${spec.path}`, packed.deltaPacked, packed.morphStruct, vertexCount),
            validateComputeResources({
                scope: `transition:${spec.path}`,
                dispatch: {
                    scope: `transition:${spec.path}`,
                    workItems: vertexCount,
                    workgroupSize,
                    workgroups: [Math.ceil(vertexCount / workgroupSize), 1, 1],
                },
                bindings: [
                    {
                        scope: `transition:${spec.path}`,
                        label: 'basePositions',
                        byteSize: vertexCount * 12,
                        strideBytes: 12,
                        maxElementIndex: vertexCount - 1,
                    },
                    {
                        scope: `transition:${spec.path}`,
                        label: 'outPositions',
                        byteSize: vertexCount * 12,
                        strideBytes: 12,
                        maxElementIndex: vertexCount - 1,
                    },
                    {
                        scope: `transition:${spec.path}`,
                        label: 'deltaPacked',
                        byteSize: packed.deltaPacked.byteLength,
                        strideBytes: DELTA_STRIDE_BYTES,
                        maxElementIndex: deltaSlots - 1,
                    },
                    {
                        scope: `transition:${spec.path}`,
                        label: 'morphStruct',
                        byteSize: packed.morphStruct.byteLength,
                        strideBytes: MORPH_STRIDE_BYTES,
                        maxElementIndex: morphCount - 1,
                    },
                ],
            }, options.limits),
        ];
        if (harness) {
            // With a real device, also let WebGPU itself speak.
            await harness.capture(`transition:${spec.path}:frame${frame}`, () => undefined);
        }
        const frameIssues = frameReports.flatMap((r) => r.issues);
        if (harness)
            frameIssues.push(...harness.issues.filter((i) => !issues.includes(i)));
        issues.push(...frameIssues);
        frames.push({
            frame,
            time,
            sampled,
            applied,
            drift: Math.abs(sampled - applied),
            morphDeltaFinite: finite,
            affectedVertices: human.affectedVertexIds().size,
            deltaSlots,
            morphCount,
            boundsOk: frameIssues.length === 0,
            issues: frameIssues,
        });
    }
    const finalValue = human.get(spec.path);
    const maxDrift = frames.reduce((acc, f) => Math.max(acc, f.drift), 0);
    const nonFiniteFrames = frames.filter((f) => !f.morphDeltaFinite).length;
    return {
        path: spec.path,
        frames,
        vertexCount,
        workgroupSize,
        ok: issues.length === 0 && nonFiniteFrames === 0,
        maxDrift,
        reachedTarget: Math.abs(finalValue - Number(spec.targetValue)) <= Math.max(tolerance, 1e-4),
        finalValue,
        targetValue: Number(spec.targetValue),
        nonFiniteFrames,
        issues,
    };
}
/** Default transition cases exercised by the CI gate. */
export const DEFAULT_TRANSITION_GPU_CASES = [
    { path: 'face.nose.width', targetValue: 1.15, duration: 0.5, curve: 'ease' },
    { path: 'face.jaw.width', targetValue: 0.9, duration: 0.4, curve: 'biological' },
    { path: 'body.muscularity', targetValue: 0.7, duration: 0.35, curve: 'spring' },
];
/** Run every default transition case on a fresh Human and aggregate. */
export async function runTransitionGpuValidationSuite(options = {}) {
    const cases = options.cases ?? DEFAULT_TRANSITION_GPU_CASES;
    const reports = [];
    for (const spec of cases) {
        const human = await Human.create();
        reports.push(await validateTransitionThroughGpuPath(human, spec, options));
    }
    const issues = reports.flatMap((r) => r.issues);
    return {
        ok: reports.every((r) => r.ok),
        reports,
        issues,
        lines: reports.map((r) => `${r.path}: frames=${r.frames.length} maxDrift=${r.maxDrift.toExponential(2)} target=${r.reachedTarget ? 'reached' : `MISSED (${r.finalValue} != ${r.targetValue})`} bounds=${r.issues.length === 0 ? 'ok' : `${r.issues.length} issues`}`),
    };
}
//# sourceMappingURL=transition-gpu-validation.js.map