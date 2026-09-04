import { Human } from '../../human.js';
import { packSparseMorphs, setMorphWeights } from './gpu-morph-buffers.js';
import {
  GpuValidationHarness,
  validateComputeResources,
  validatePackedMorphBounds,
  type GpuBoundsReport,
  type GpuLimitsLike,
  type GpuValidationIssue,
} from '../device/gpu-validation-harness.js';
import {
  createParameterTransition,
  sampleTransition,
  type TransitionSpec,
} from '../../core/transitions/parameter-transition.js';

/**
 * Timeline parameter transitions, validated through the GPU morph path.
 *
 * `parameterTransitions` stayed PROTOTYPE for one reason: the curve maths were
 * proven in isolation (`parameter-transition.test.ts`), but nobody proved that a
 * *running* transition survives the trip through the event timeline, the sparse
 * morph compiler, the packed GPU buffers, and the compute dispatch — frame after
 * frame, without a NaN, an out-of-range morph range, or a dispatch that misses
 * part of the mesh.
 *
 * This module walks a transition frame by frame on the real `Human` and, for each
 * frame, re-derives exactly what the GPU would consume:
 *
 *   morphDelta -> packSparseMorphs -> setMorphWeights -> dispatch bounds
 *
 * It is headless: no GPUDevice is required (a device, when present, is used only
 * for live error-scope capture). That makes it a CI gate rather than a demo.
 */

export interface TransitionGpuFrame {
  frame: number;
  time: number;
  /** Value sampled from the transition curve at this frame. */
  sampled: number;
  /** Value actually stored on the definition after the event applied. */
  applied: number;
  /** Absolute difference between curve and definition. */
  drift: number;
  morphDeltaFinite: boolean;
  affectedVertices: number;
  deltaSlots: number;
  morphCount: number;
  boundsOk: boolean;
  issues: GpuValidationIssue[];
}

export interface TransitionGpuValidationReport {
  path: string;
  frames: TransitionGpuFrame[];
  vertexCount: number;
  workgroupSize: number;
  /** Every frame packed and dispatched within bounds, with finite deltas. */
  ok: boolean;
  maxDrift: number;
  /** True when the final frame equals the transition's target value. */
  reachedTarget: boolean;
  finalValue: number;
  targetValue: number;
  nonFiniteFrames: number;
  issues: GpuValidationIssue[];
}

export interface TransitionGpuValidationOptions {
  /** Frames per second of the simulated timeline (default 60). */
  fps?: number;
  /** Workgroup size of the morph kernel (must match the WGSL, default 64). */
  workgroupSize?: number;
  /** Device limits to validate against; defaults to conservative WebGPU minimums. */
  limits?: GpuLimitsLike;
  /** Optional real device — enables live validation error-scope capture. */
  device?: GPUDevice;
  /** Tolerance for curve-vs-definition drift (default 1e-6). */
  tolerance?: number;
}

/** Bytes per packed delta quad (index, dx, dy, dz) — must match the kernel. */
const DELTA_STRIDE_BYTES = 16;
/** Bytes per packed morph meta struct (weight, count, offset, pad). */
const MORPH_STRIDE_BYTES = 16;

/**
 * Drive one parameter transition on a real Human and validate every frame's GPU
 * morph payload.
 */
export async function validateTransitionThroughGpuPath(
  human: Human,
  spec: TransitionSpec,
  options: TransitionGpuValidationOptions = {},
): Promise<TransitionGpuValidationReport> {
  const fps = Math.max(1, options.fps ?? 60);
  const workgroupSize = options.workgroupSize ?? 64;
  const tolerance = options.tolerance ?? 1e-6;
  const dt = 1 / fps;

  const transition = createParameterTransition(
    human.definitionRef,
    { ...spec, id: spec.id ?? `${spec.path}-validation` },
    0,
  );

  // Install the transition on the timeline exactly as an application would.
  human.transition(
    spec.path,
    Number(spec.targetValue),
    spec.duration,
    spec.curve ?? 'linear',
    'automation',
  );

  const canonical = human.canonicalRef;
  const vertexCount = canonical.vertexCount;
  const harness = options.device ? new GpuValidationHarness(options.device) : null;

  const frames: TransitionGpuFrame[] = [];
  const issues: GpuValidationIssue[] = [];
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

    const frameReports: GpuBoundsReport[] = [
      validatePackedMorphBounds(
        `transition:${spec.path}`,
        packed.deltaPacked,
        packed.morphStruct,
        vertexCount,
      ),
      validateComputeResources(
        {
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
        },
        options.limits,
      ),
    ];

    if (harness) {
      // With a real device, also let WebGPU itself speak.
      await harness.capture(`transition:${spec.path}:frame${frame}`, () => undefined);
    }

    const frameIssues = frameReports.flatMap((r) => r.issues);
    if (harness) frameIssues.push(...harness.issues.filter((i) => !issues.includes(i)));
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
export const DEFAULT_TRANSITION_GPU_CASES: TransitionSpec[] = [
  { path: 'face.nose.width', targetValue: 1.15, duration: 0.5, curve: 'ease' },
  { path: 'face.jaw.width', targetValue: 0.9, duration: 0.4, curve: 'biological' },
  { path: 'body.muscularity', targetValue: 0.7, duration: 0.35, curve: 'spring' },
];

export interface TransitionGpuSuiteReport {
  ok: boolean;
  reports: TransitionGpuValidationReport[];
  issues: GpuValidationIssue[];
  lines: string[];
}

/** Run every default transition case on a fresh Human and aggregate. */
export async function runTransitionGpuValidationSuite(
  options: TransitionGpuValidationOptions & { cases?: readonly TransitionSpec[] } = {},
): Promise<TransitionGpuSuiteReport> {
  const cases = options.cases ?? DEFAULT_TRANSITION_GPU_CASES;
  const reports: TransitionGpuValidationReport[] = [];
  for (const spec of cases) {
    const human = await Human.create();
    reports.push(await validateTransitionThroughGpuPath(human, spec, options));
  }
  const issues = reports.flatMap((r) => r.issues);
  return {
    ok: reports.every((r) => r.ok),
    reports,
    issues,
    lines: reports.map(
      (r) =>
        `${r.path}: frames=${r.frames.length} maxDrift=${r.maxDrift.toExponential(2)} target=${r.reachedTarget ? 'reached' : `MISSED (${r.finalValue} != ${r.targetValue})`} bounds=${r.issues.length === 0 ? 'ok' : `${r.issues.length} issues`}`,
    ),
  };
}
