import { PropertyRegistry } from './core/schema/registry.js';
import { createDefaultRegistry } from './core/schema/descriptors.js';
import { HumanDefinition } from './core/schema/human-definition.js';
import {
  CharacterEvent,
  createEvent,
  applyEventToDefinition,
  EventSource,
} from './core/events/character-event.js';
import { CharacterTimeline, Snapshot } from './core/timeline/character-timeline.js';
import { ConstraintSolver, ConstraintProfile } from './core/constraints/solver.js';
import { DependencyGraph } from './compiler/dependency/dependency-graph.js';
import { DeltaCompiler, KernelWork } from './compiler/delta/delta-compiler.js';
import {
  AffectedSystem,
  affectedSystemsForChange,
} from './compiler/dependency/affected-systems.js';
import { DirtyRegionTracker } from './compiler/delta/dirty-regions.js';
import { IdentitySolver } from './identity/solver/identity-solver.js';
import { CanonicalHuman } from './geometry/canonical/canonical-human.js';
import type { CanonicalHumanProvider } from './geometry/canonical/canonical-provider.js';
import { SparseMorphSet } from './geometry/morph/sparse-morph.js';
import { MorphDriver } from './geometry/morph/morph-driver.js';
import type { MorphCorrectiveWeight } from './geometry/morph/morph-driver.js';
import { MorphKernel } from './gpu/kernels/morph-kernel.js';
import { HumanShapeSpace } from './anatomy/shape-space/human-shape-space.js';
import { CorrectiveShapeSolver } from './anatomy/shape-space/shape-corrective-solver.js';
import { buildHdShapeSpace } from './anatomy/shape-space/hd-shape-builder.js';
import { HumanProfiler, countDirtyVertices } from './gpu/profiler/profiler.js';
import {
  FacialExpressionSystem,
  SemanticExpression,
} from './animation/facial/facial-expression.js';
import { SpeechSolver, simpleTTS } from './animation/speech/speech-solver.js';
import { SemanticLOD, PerceptualLOD } from './lod/index.js';
import { DeterministicPromptInterpreter, Intent, intentToEvent } from './ai/prompt/interpreter.js';
import { WebGpuHumanPipeline } from './render/webgpu/pipeline.js';
import {
  resolveAnatomy,
  AnatomyDimensions,
  validateAnatomy,
  anatomySatisfaction,
} from './anatomy/parametric/parametric-anatomy.js';
import { placeSkeletonFromDefinition, BoneDef } from './anatomy/skeleton/skeleton.js';
import { combinedSkinMatrices } from './anatomy/skeleton/bone-matrix.js';
import {
  SkeletalAnimation,
  AnimationChannel,
  BonePose,
} from './animation/skeleton/skeletal-animation.js';
import { buildInfluences, skinMeshCPU, skinNormalsCPU } from './gpu/kernels/skin-mesh.js';
import {
  AttachmentSystem,
  HumanAttachment,
  AttachmentAnchor,
} from './attachments/attachment-system.js';
import {
  generateStrandHair,
  StrandHairGeometry,
  StrandHairOptions,
} from './surface/hair/strand-hair.js';
import { buildHumanSdfField, HumanSdfField } from './physics/sdf/human-sdf.js';
import {
  ClothMesh,
  ClothStepOptions,
  createTorsoCloth,
  simulateCloth,
} from './physics/cloth/cloth-sim.js';
import {
  generateSkinResiduals,
  SkinResidualField,
  SkinResidualOptions,
} from './surface/skin/neural-skin.js';
import { MotionCompiler, MotionPlan } from './animation/motion/motion-compiler.js';
import {
  MotionRuntime,
  type MotionRuntimeConfig,
  type MotionRuntimeFrame,
} from './animation/motion/motion-runtime.js';
import {
  KioskBehavior,
  type KioskBehaviorConfig,
  type KioskBehaviorFrame,
} from './kiosk/kiosk-behavior.js';
import {
  PerceptualValidationReport,
  validatePerceptualHuman,
} from './validation/perceptual-validator.js';
import { projectTattooDecals, TattooDecal } from './surface/tattoo/tattoo-decal.js';
import { generateGarments, GarmentMesh } from './surface/clothing/garment.js';
import {
  buildInternalAnatomyView,
  InternalAnatomyMode,
  InternalAnatomyView,
} from './anatomy/internal/internal-anatomy.js';
import {
  createParameterTransition,
  ParameterTransition,
  sampleTransition,
  transitionComplete,
  TransitionCurve,
} from './core/transitions/parameter-transition.js';

export interface HumanCreateOptions {
  registry?: PropertyRegistry;
  seed?: Record<string, number>;
  device?: GPUDevice;
  format?: GPUTextureFormat;
  /**
   * A canonical topology provider. When omitted, the default debug/build block
   * human is used. Loading is async and happens in `Human.create`.
   */
  canonicalProvider?: CanonicalHumanProvider;
  /** Internal: the resolved canonical mesh (built from the provider). */
  canonical?: CanonicalHuman;
}

export interface HumanModifyResult {
  cancelled: boolean;
  reason?: string;
  affectedKernelWork: KernelWork[];
  affectedSystems: AffectedSystem[];
  dirtyRegions: string[];
}

const DEFAULT_BONE_NAMES = [
  'root',
  'pelvis',
  'spine_01',
  'spine_02',
  'chest',
  'neck',
  'head',
  'jaw',
  'clavicle_l',
  'clavicle_r',
  'upperarm_l',
  'upperarm_r',
  'forearm_l',
  'forearm_r',
  'hand_l',
  'hand_r',
  'thigh_l',
  'thigh_r',
  'shin_l',
  'shin_r',
  'foot_l',
  'foot_r',
];

/**
 * The ultimate character API. Everything resolves through a single event
 * architecture. One canonical human is loaded; each Human instance is a
 * persistent semantic character compiled into minimal GPU work.
 */
export class Human {
  readonly registry: PropertyRegistry;
  private definition: HumanDefinition;
  private timeline: CharacterTimeline;
  private constraints: ConstraintSolver;
  private deps: DependencyGraph;
  private delta: DeltaCompiler;
  private dirty: DirtyRegionTracker;
  private identity: IdentitySolver;
  private canonical: CanonicalHuman;
  private morphs: SparseMorphSet;
  private motionRuntime?: MotionRuntime;
  private kiosk?: KioskBehavior;
  private morphDriver: MorphDriver;
  private morphKernel: MorphKernel;
  private shapeSpace: HumanShapeSpace;
  private correctives!: CorrectiveShapeSolver;
  private correctiveMorphInputs: Array<{
    name: string;
    inputs: MorphCorrectiveWeight['inputs'];
  }> = [];
  /** Vertex ids affected by the shape bases currently contributing (P17). */
  private currentAffectedVertices = new Set<number>();
  readonly profiler = new HumanProfiler();
  private facial = new FacialExpressionSystem();
  private speech = new SpeechSolver();
  private semanticLod = new SemanticLOD();
  private perceptualLod = new PerceptualLOD();
  private prompter = new DeterministicPromptInterpreter();
  private animation = new SkeletalAnimation();
  private motion = new MotionCompiler();
  private currentPose: BonePose[] = [];
  private transitions: ParameterTransition[] = [];
  private skinInfluences = null as ReturnType<typeof buildInfluences> | null;
  private clock = 0;
  private gpu: WebGpuHumanPipeline | null = null;
  private attachments = new AttachmentSystem();

  private constructor(opts: HumanCreateOptions) {
    this.registry = opts.registry ?? createDefaultRegistry();
    this.definition = new HumanDefinition(this.registry, opts.seed);
    this.timeline = new CharacterTimeline(this.definition);
    this.constraints = new ConstraintSolver(this.registry);
    this.deps = new DependencyGraph(this.registry);
    this.dirty = new DirtyRegionTracker(this.registry);
    this.identity = new IdentitySolver(this.registry);
    this.canonical = opts.canonical ?? new CanonicalHuman(DEFAULT_BONE_NAMES);
    this.delta = new DeltaCompiler(this.registry, this.deps, this.canonical);
    this.morphs = new SparseMorphSet(this.canonical);
    this.morphDriver = new MorphDriver(this.registry);
    this.morphKernel = new MorphKernel(this.morphs, this.morphDriver, opts.device ?? null);

    // Human Shape Space V0.1: register the 10 identity controls + combination
    // correctives, compile them into the existing sparse morph pipeline (P6-P11).
    this.shapeSpace = this.registerShapeSpace();

    // MorphDriver maps each compiled shape morph back to its property so the
    // existing GPU/CPU morph path drives them (coefficients == driver weights).
    this.registerShapeMorphsInDriver();

    this.registerCanonicalMorphs();
    this.registerPoseCorrectives();
    this.device = opts.device ?? null;
    const skeleton = this.parametricSkeleton();
    if (opts.device) {
      this.gpu = new WebGpuHumanPipeline(this.canonical, this.morphs, this.morphDriver, {
        device: opts.device,
        format: opts.format,
        paramByteSize: this.registry.sizeBytes,
        skeleton,
      });
    }
  }

  /** Human Shape Space V0.1: register the 10 identity controls + combination correctives. */
  private registerShapeSpace(): HumanShapeSpace {
    const { space, spec } = buildHdShapeSpace(this.canonical);
    // Compile every basis (including correctives) into the sparse morph set so
    // the existing GPU morph pipeline consumes them with zero new infrastructure.
    space.compileToSparseMorphs(this.morphs);
    this.correctiveMorphInputs = spec.correctiveMorphs;
    this.correctives = new CorrectiveShapeSolver(space, spec.correctiveRules);
    return space;
  }

  /**
   * Tell MorphDriver which property (or corrective combination) drives each
   * compiled shape morph, so the existing GPU/CPU morph path evaluates the same
   * coefficients the shape space computes. Correctives use a continuous product
   * weight across their inputs (P11).
   */
  private registerShapeMorphsInDriver(): void {
    for (const basis of this.shapeSpace.bases.list()) {
      const morphName = `shape_${basis.name}`;
      const isCorrective = basis.tags?.includes('corrective');
      // Corrective bases are weighted by a multi-property product; register them
      // from the known corrective map. Linear bases map 1:1 to their property.
      if (!isCorrective) this.morphDriver.registerBasis(morphName, basis.property);
    }
    for (const { name, inputs } of this.correctiveMorphInputs) {
      this.morphDriver.registerCorrective(name, inputs);
    }
  }

  /**
   * Pose/skeleton correctives (P15): bone-driven morphs reach the GPU/CPU morph
   * pipeline exactly like property shapes. The supply of pose comes from the
   * current skeleton deflection via MorphDriver.setPose(), which Human.setPose()
   * refreshes each time the character is posed.
   */
  private registerPoseCorrectives(): void {
    // Pure bone source: when the head tilts back (roll about the head's z axis a
    // long way from neutral), the chin/lower-face region is pulled toward the
    // neck to keep the mouth roughly level (joint-volume preservation).
    this.morphs.add('poseHeadTiltChin', 'chin', (vx, _vy) => {
      return { dx: vx * 0.12, dy: -0.06, dz: -0.08 };
    });
    this.morphDriver.registerBone('poseHeadTiltChin', 'head', 'z', 0, 30);

    // Property × bone corrective: jaw-open activation is amplified (product) only
    // when the head also nods forward about its x axis — a combination corrective
    // that blends a shape property with a skeletal pose factor.
    this.morphs.add('poseJawTiltCorrective', 'lower_lip', (_vx, vy, _vz) => {
      const lift = vy > 1.7 ? 1 : 0;
      return { dx: 0, dy: -lift * 0.08, dz: lift * 0.12 };
    });
    this.morphDriver.registerCorrective('poseJawTiltCorrective', [
      { property: 'expression.jawOpen' },
      { boneName: 'head', axis: 'x', neutralDeg: 0, spanDeg: 25 },
    ]);
  }

  /**
   * Number of corrective rules meaningfully active (coefficient threshold) under
   * the current definition — P11/P17 telemetry. 0 when none are active.
   */
  private contributingCorrectiveRules(): number {
    const coeffs = this.shapeCoefficients();
    return this.correctives.listActiveRules(coeffs).length;
  }

  /** Full coefficient map (property ratio about neutral) for every registered basis. */
  private shapeCoefficients(): Map<number, number> {
    const out = new Map<number, number>();
    for (const basis of this.shapeSpace.bases.list()) {
      const meta = this.registry.require(basis.property);
      const value = this.definition.get(basis.property);
      const coeff =
        meta.default !== 0
          ? value / meta.default - 1
          : (value - (typeof meta.min === 'number' ? meta.min : 0)) /
            ((typeof meta.max === 'number' ? meta.max : 1) -
              (typeof meta.min === 'number' ? meta.min : 0) || 1);
      out.set(basis.id, coeff);
    }
    return out;
  }

  /** Create a human asynchronously (GPU device optional). */
  static async create(opts: HumanCreateOptions = {}): Promise<Human> {
    let canonical: CanonicalHuman | undefined = opts.canonical;
    if (!canonical && opts.canonicalProvider) {
      const asset = await opts.canonicalProvider.load();
      canonical = CanonicalHuman.fromTopology(asset.topology, DEFAULT_BONE_NAMES);
    }
    return new Human({ ...opts, canonical });
  }

  private registerCanonicalMorphs(): void {
    // NOTE: The 10 identity face controls (nose/jaw/chin/eye/cheek/mouth/lips)
    // are owned by the Human Shape Space (registerShapeSpace), which compiles
    // them into this same sparse morph set with coarse-region fallback so they
    // work on both the HD head and the debug block human. Only the body, anatomy
    // and expression morphs below are defined here (body identity now lives in
    // the shape space as sparse correlated shape bases — see buildHdShapeSpace).
    // Eyeball spacing on the detail sclera/iris parts (the shape space's
    // EyeSpacingBasis drives the border/eyelid/eye-box regions; these drive the
    // separately-spawned sclera + iris sub-meshes so the whole eye moves).
    this.morphs.add('eyeSpacingSclera', 'eye_sclera', (vx) => {
      return { dx: Math.sign(vx) * 0.04, dy: 0, dz: 0 };
    });
    this.morphs.add('eyeSpacingIris', 'eye_iris', (vx) => {
      return { dx: Math.sign(vx) * 0.04, dy: 0, dz: 0 };
    });
    // Jaw open: lower the tongue and widen the mouth cavity (part-localized).
    this.morphs.add('jawOpen', 'tongue', (_vx, vy) => ({
      dx: 0,
      dy: -0.02 * (vy < 1.79 ? 1 : 0.4),
      dz: 0,
    }));
    this.morphs.add('jawOpenCavity', 'mouth_cavity', (_vx, vy, vz) => ({
      dx: 0,
      dy: -0.015 * (vz > 0.18 ? 1 : 0.3),
      dz: 0,
    }));
  }

  // ---------------------------------------------------------------- getters

  get definitionRef(): HumanDefinition {
    return this.definition;
  }
  get canonicalRef(): CanonicalHuman {
    return this.canonical;
  }
  /** Registered sparse morphs, read-only handle for validation/telemetry. */
  get morphsRef(): SparseMorphSet {
    return this.morphs;
  }

  get constraintsRef(): ConstraintSolver {
    return this.constraints;
  }
  get semanticLodRef(): SemanticLOD {
    return this.semanticLod;
  }

  get(path: string): number {
    return this.definition.get(path);
  }

  /**
   * Recompute the accumulated sparse-morph deltas for the current definition.
   * Used by renderers (CPU reference / demo) and tests to show that only
   * affected geometry moves. Linear shape bases + combination correctives all
   * flow through the same sparse morph pipeline.
   */
  computeMorphDelta(): Float32Array {
    const delta = new Float32Array(this.canonical.vertexCount * 3);
    this.morphKernel.accumulate(this.definition, delta);
    this.currentAffectedVertices = this.shapeSpace.affectedVertexIds(this.shapeCoefficients());
    return delta;
  }

  /**
   * Vertex ids the shape space currently displaces (P17 localized-edit proof).
   * Consumed by the demo overlay to highlight affected geometry.
   */
  affectedVertexIds(): Set<number> {
    return this.currentAffectedVertices.size > 0
      ? this.currentAffectedVertices
      : this.shapeSpace.affectedVertexIds(this.shapeCoefficients());
  }

  /** Number of corrective rules active under the current definition (P11/P17). */
  activeCorrectiveCount(): number {
    return this.contributingCorrectiveRules();
  }

  /** The WebGPU pipeline, if this Human was created with a GPU device. */
  get gpuPipeline(): WebGpuHumanPipeline | null {
    return this.gpu;
  }

  /** Names of all registered sparse morphs (telemetry / part inspection). */
  morphNames(): string[] {
    return [...this.morphs.byName.keys()];
  }

  /**
   * Resolve the current definition into concrete, measured body dimensions
   * (the anatomical-constraint side of the pipeline). Deterministic.
   */
  solveAnatomy(): AnatomyDimensions {
    return resolveAnatomy(this.definition);
  }

  /** Anatomical-plausibility constraints for the current body shape. */
  anatomyConstraints() {
    return validateAnatomy(this.solveAnatomy());
  }

  /** Aggregate anatomy satisfaction, 0..1. */
  anatomyScore(): number {
    return anatomySatisfaction(this.anatomyConstraints());
  }

  /**
   * The parametrically-placed T-pose skeleton whose joints match the resolved
   * anatomy (and therefore the deformed block geometry).
   */
  parametricSkeleton(): BoneDef[] {
    return placeSkeletonFromDefinition(this.solveAnatomy());
  }

  // ------------------------------------------------------------- animation

  /** Register an animation replay channel list under a clip name. */
  addClip(name: string, channels: AnimationChannel[]): void {
    this.animation.addClip(name, channels);
  }

  /** Set the blend weight of a named clip (0 = off, 1 = full). */
  playClip(name: string, weight: number): void {
    this.animation.setWeight(name, weight);
  }

  /** Sample the active clips at time `t` into per-bone poses. */
  samplePose(t: number): BonePose[] {
    return this.animation.sample([...DEFAULT_BONE_NAMES], t);
  }

  /**
   * Apply a set of bone poses to the character: updates the GPU skin matrix
   * buffer (when a GPU pipeline exists) and the CPU skin reference. A rest pose
   * (empty poses) leaves the mesh unchanged.
   */
  setPose(poses: BonePose[]): void {
    this.currentPose = poses;
    // Feed pose into the morph driver so bone-driven (pose) correctives evaluate
    // from the current skeleton deflection (P15).
    this.morphDriver.setPose(this.parametricSkeleton(), poses);
    if (this.gpu) this.gpu.setPose(poses);
  }

  /** Sample the current clips at time `t` and apply the resulting pose. */
  animate(t: number): void {
    this.setPose(this.samplePose(t));
  }

  compileMotion(command: string): MotionPlan {
    return this.motion.compile(command, this.parametricSkeleton());
  }

  perform(command: string, source: EventSource = 'ui'): HumanModifyResult {
    const plan = this.compileMotion(command);
    if (plan.kind === 'unknown') {
      return {
        cancelled: true,
        reason: plan.reason,
        affectedKernelWork: [],
        affectedSystems: [],
        dirtyRegions: [],
      };
    }
    return this.applyEvent(
      createEvent('pose', source, { payload: { command, plan, poses: plan.poses } }),
    );
  }

  // ------------------------------------------------- continuous motion runtime

  /**
   * Continuous motion (P17): `perform()` applies a compiled plan as a single
   * snapped pose, which is right for a one-shot event but cannot cross-fade or
   * cycle. `startMotion()` hands the command to a MotionRuntime that is ticked
   * from `update(dt)`, so gestures blend in and locomotion actually walks.
   * `perform()` and clip playback keep working exactly as before.
   */
  startMotion(command: string, config: Partial<MotionRuntimeConfig> = {}): boolean {
    if (!this.motionRuntime) {
      this.motionRuntime = new MotionRuntime(this.parametricSkeleton(), config);
    }
    return this.motionRuntime.push(command).accepted;
  }

  /** Cross-fade the active continuous motion back to rest. */
  stopMotion(): void {
    this.motionRuntime?.release();
  }

  /** Runtime handle for status/diagnostics; null until startMotion() is called. */
  get motionRuntimeRef(): MotionRuntime | null {
    return this.motionRuntime ?? null;
  }

  /** Advance the motion runtime by `dt` and apply the resulting pose. */
  tickMotion(dt: number): MotionRuntimeFrame | null {
    if (!this.motionRuntime) return null;
    const frame = this.motionRuntime.tick(dt);
    if (frame.poses.length > 0) this.setPose(frame.poses);
    return frame;
  }

  // ------------------------------------------------------------------ kiosk

  /**
   * Turn on the kiosk behaviour layer: natural blinking, gaze behaviour with
   * micro-saccades and eye-contact rhythm, idle/listening/thinking/speaking
   * posture with breathing and small gestures, and interruption handling.
   *
   * The behaviour layer is additive — it writes only `expression.*` performance
   * controls and the motion runtime's gaze/gesture inputs, so identity, clips
   * and `perform()` keep working unchanged.
   */
  startKioskBehavior(config: Partial<KioskBehaviorConfig> = {}): KioskBehavior {
    this.kiosk = new KioskBehavior(config);
    if (!this.motionRuntime) {
      this.motionRuntime = new MotionRuntime(this.parametricSkeleton());
    }
    return this.kiosk;
  }

  /** Behaviour handle for events/status; null until startKioskBehavior(). */
  get kioskBehaviorRef(): KioskBehavior | null {
    return this.kiosk ?? null;
  }

  stopKioskBehavior(): void {
    this.kiosk?.reset();
    this.kiosk = undefined;
    this.motionRuntime?.clearLookAtTarget();
  }

  /**
   * Advance the kiosk behaviour by `dt` and apply it: expression controls onto
   * the definition, gaze onto the motion runtime's persistent look-at, and any
   * scheduled small gesture as a motion command.
   */
  tickKiosk(dt: number): KioskBehaviorFrame | null {
    if (!this.kiosk) return null;
    const frame = this.kiosk.tick(dt);
    for (const [path, value] of Object.entries(frame.expression)) {
      this.definition.set(path, value);
    }
    const motion = this.motionRuntime;
    if (motion) {
      motion.setLookAtTarget(frame.lookAtTarget, { intensity: frame.lookAtIntensity });
      if (frame.gesture) motion.push(frame.gesture);
    }
    return frame;
  }

  /**
   * CPU skinning reference: transform the canonical base positions by the
   * current pose's bone matrices. At rest this equals the base geometry, so
   * rotating a limb bone moves exactly its vertices.
   */
  skinScene(): Float32Array {
    const skeleton = this.parametricSkeleton();
    if (!this.skinInfluences) this.skinInfluences = buildInfluences(this.canonical, skeleton);
    const matrices = combinedSkinMatrices(skeleton, this.currentPose);
    // Apply shape morph deltas to the base geometry before skinning so that
    // both body/identity edits AND pose edits move the rendered skin.
    const base = this.canonical.baseGeometry().positions;
    const delta = this.computeMorphDelta();
    let positions = base;
    let hasDelta = false;
    for (let i = 0; i < delta.length; i++) {
      if (delta[i] !== 0) {
        hasDelta = true;
        break;
      }
    }
    if (hasDelta) {
      positions = new Float32Array(base.length);
      for (let i = 0; i < base.length; i++) positions[i] = base[i] + delta[i];
    }
    return skinMeshCPU(positions, this.skinInfluences, matrices);
  }

  /**
   * CPU skinning reference for normals: transforms the canonical base normals
   * by the current pose's rotation matrices (see `skinNormalsCPU`). Returns a
   * Float32Array of length vertexCount*3.
   */
  skinNormals(): Float32Array {
    const skeleton = this.parametricSkeleton();
    if (!this.skinInfluences) this.skinInfluences = buildInfluences(this.canonical, skeleton);
    const matrices = combinedSkinMatrices(skeleton, this.currentPose);
    return skinNormalsCPU(this.canonical.baseGeometry().normals, this.skinInfluences, matrices);
  }

  // ------------------------------------------------------------ attachments

  /** Current non-geometry attachments anchored to semantic regions/bones. */
  listAttachments(): HumanAttachment[] {
    return this.attachments.list();
  }

  addAttachment(attachment: HumanAttachment, source: EventSource = 'api'): HumanModifyResult {
    const eventType = attachment.kind === 'tattoo' ? 'addTattoo' : 'wear';
    return this.applyEvent(createEvent(eventType, source, { payload: { attachment } }));
  }

  addTattoo(
    id: string,
    anchor: AttachmentAnchor,
    data: Record<string, unknown> = {},
  ): HumanModifyResult {
    return this.addAttachment({ id, kind: 'tattoo', anchor, data }, 'api');
  }

  wear(
    id: string,
    anchor: AttachmentAnchor,
    data: Record<string, unknown> = {},
  ): HumanModifyResult {
    return this.addAttachment({ id, kind: 'wearable', anchor, data }, 'api');
  }

  removeAttachment(id: string, source: EventSource = 'api'): HumanModifyResult {
    return this.applyEvent(createEvent('removeAttachment', source, { payload: { id } }));
  }

  attachmentPosition(id: string) {
    const attachment = this.attachments.get(id);
    if (!attachment) return null;
    return this.attachments.resolve(
      attachment,
      this.canonical,
      this.parametricSkeleton(),
      this.currentPose,
      this.computeMorphDelta(),
    );
  }

  // ---------------------------------------------------------------- surface

  /** Deterministic CPU strand-hair prototype generated from HDL hair params. */
  hairGeometry(options: StrandHairOptions = {}): StrandHairGeometry {
    return generateStrandHair(this.definition, this.canonical, options);
  }

  /** Human-specific collision SDF prototype from anatomy + skeleton capsules. */
  sdfField(): HumanSdfField {
    return buildHumanSdfField(this.solveAnatomy(), this.parametricSkeleton());
  }

  sdfDistance(point: { x: number; y: number; z: number }): number {
    return this.sdfField().distance(point);
  }

  /** Build a deterministic torso cloth panel for CPU cloth simulation. */
  createCloth(width?: number, height?: number): ClothMesh {
    return createTorsoCloth(width, height);
  }

  simulateCloth(mesh: ClothMesh, steps: number, options: ClothStepOptions = {}): ClothMesh {
    return simulateCloth(mesh, this.sdfField(), steps, options);
  }

  /** Deterministic procedural residual layer for skin color/roughness/detail. */
  skinResiduals(options: SkinResidualOptions = {}): SkinResidualField {
    return generateSkinResiduals(this.definition, this.canonical, options);
  }

  /** Project tattoo attachments to stable semantic-region decal samples. */
  tattooDecals(): TattooDecal[] {
    return projectTattooDecals(this.listAttachments(), this.canonical);
  }

  /** Generate separate wearable garment meshes from current wear attachments. */
  garments(): GarmentMesh[] {
    return generateGarments(this.listAttachments(), this.solveAnatomy());
  }

  /** Non-mutating perceptual validation; corrective requests are suggestions only. */
  validatePerceptual(): PerceptualValidationReport {
    return validatePerceptualHuman(this.definition, this.canonical, this.solveAnatomy());
  }

  /** Lazily derive modular internal-anatomy display data from persistent state. */
  internalAnatomy(mode: InternalAnatomyMode = 'anatomy'): InternalAnatomyView {
    return buildInternalAnatomyView(this.solveAnatomy(), this.parametricSkeleton(), mode);
  }

  /** Upload current params + morph weights to the GPU. No-op without a device. */
  uploadGpu(definition: HumanDefinition = this.definition): void {
    if (this.gpu) this.gpu.upload(definition);
  }

  /**
   * Encode one full frame into `view`: morph-deform compute, then draw the
   * deformed mesh. Returns the finished command buffer (submit it). Returns
   * null when this Human has no GPU pipeline.
   */
  encodeFrame(view: GPUTextureView, width: number, height: number): GPUCommandBuffer | null {
    if (!this.gpu || !this.device) return null;
    this.gpu.upload(this.definition);
    const enc = this.device.createCommandEncoder();
    this.gpu.render(enc, view, width, height);
    return enc.finish();
  }

  /**
   * Convenience for canvas hosts: encode + submit one frame to the device
   * queue, drawing into the current texture of a WebGPU canvas context.
   * Returns false when no GPU pipeline exists.
   */
  renderToContext(ctx: GPUCanvasContext): boolean {
    if (!this.gpu || !this.device) return false;
    const view = ctx.getCurrentTexture().createView();
    const size = ctx.getCurrentTexture();
    const buf = this.encodeFrame(view, size.width, size.height);
    if (!buf) return false;
    this.device.queue.submit([buf]);
    return true;
  }
  private device: GPUDevice | null = null;

  // -------------------------------------------------------------- mutation

  /**
   * Apply any CharacterEvent through the single event architecture. This is the
   * ONLY mutation path (AI, UI, automation, simulation, external all use it).
   */
  applyEvent(
    event: CharacterEvent,
    opts: { identityBudget?: { amount: number; allowedDimensions?: string[] } } = {},
  ): HumanModifyResult {
    // 1. Identity preservation gate.
    const gate = this.identity.gate(event, this.definition, opts.identityBudget);
    if (!gate.allowed) {
      return {
        cancelled: true,
        reason: gate.reason,
        affectedKernelWork: [],
        affectedSystems: [],
        dirtyRegions: [],
      };
    }

    // 2. Functional application plus event-specific state changes.
    const beforeDefinition = this.definition.serialize();
    const propChanges = applyEventToDefinition(this.definition, event) ?? [];

    // 3. Timeline records it (event sourcing + undo/redo).
    this.timeline.push(event);
    this.attachments.applyEvent(event);
    if (event.type === 'expression') this.applyExpressionEvent(event);
    if (event.type === 'pose') this.applyPoseEvent(event);
    if (event.type === 'transition') this.registerTransitionEvent(event);
    if (event.type === 'advanceTime') propChanges.push(...this.applyAdvanceTimeEvent(event));
    for (const id of this.changedIdsBetween(beforeDefinition, this.definition.serialize())) {
      if (!propChanges.includes(id)) propChanges.push(id);
    }

    // 4. Constraint validation of resulting definition.
    const constraint = this.constraints.validate(this.definition);
    if (constraint.satisfaction < 0.2) {
      return {
        cancelled: true,
        reason: 'constraint violation: ' + constraint.messages.join('; '),
        affectedKernelWork: [],
        affectedSystems: [],
        dirtyRegions: [],
      };
    }

    // 5. Mark dirty + compile minimal GPU work.
    const kernelWork = [...this.compileForChange(propChanges), ...this.kernelWorkForEvent(event)];
    const affectedSystems = [
      ...affectedSystemsForChange(this.registry, this.deps, propChanges),
      ...this.affectedSystemsForEvent(event),
    ];

    // 6. Run morph compute (CPU reference path).
    const delta = new Float32Array(this.canonical.vertexCount * 3);
    this.morphKernel.accumulate(this.definition, delta);

    const dirtyRegionNames = isAttachmentEvent(event)
      ? ['Attachment']
      : event.type === 'pose'
        ? ['Animation']
        : this.dirty.describe();
    const verticesModified = countDirtyVertices(this.canonical, dirtyRegionNames as never[]);
    this.profiler.record({
      computePasses: kernelWork.length,
      dirtyRegions: dirtyRegionNames,
      verticesModified,
      morphDeltaProcessed: this.morphKernel.deltaCount,
      cpuTimeMs: 0,
    });

    return {
      cancelled: false,
      affectedKernelWork: kernelWork,
      affectedSystems,
      dirtyRegions: dirtyRegionNames,
    };
  }

  private compileForChange(changedIds: number[]): KernelWork[] {
    for (const id of changedIds) this.dirty.touch(id);
    return this.delta.compile(changedIds);
  }

  /** Central modifier: single change. */
  modify(changes: Record<string, number>, source: EventSource = 'ui'): HumanModifyResult {
    return this.applyEvent(createEvent('set', source, { changes }));
  }

  /** Non-destructive adjust (multiply). */
  adjust(path: string, factor: number, source: EventSource = 'ui'): HumanModifyResult {
    return this.applyEvent(createEvent('adjust', source, { path, factor }));
  }

  /** Schedule a deterministic time-based property transition through events. */
  transition(
    path: string,
    targetValue: number,
    duration: number,
    curve: TransitionCurve = 'linear',
    source: EventSource = 'api',
  ): HumanModifyResult {
    return this.applyEvent(
      createEvent('transition', source, { payload: { path, targetValue, duration, curve } }),
    );
  }

  /** Advance event time so active parameter transitions update the definition. */
  advanceTime(seconds: number, source: EventSource = 'simulation'): HumanModifyResult {
    return this.applyEvent(createEvent('advanceTime', source, { payload: { seconds } }));
  }

  setExpression(expr: SemanticExpression, intensity = 1): HumanModifyResult {
    return this.applyEvent(
      createEvent('expression', 'ui', { payload: { expression: expr, intensity } }),
    );
  }

  speak(text: string): HumanModifyResult {
    const track = simpleTTS(text);
    return this.applyEvent(createEvent('speak', 'ui', { payload: { text, track } }));
  }

  /** Advance speech/simulation time. */
  update(dt: number): void {
    this.advanceTime(dt, 'simulation');
    // Kiosk behaviour (blink/gaze/idle) writes its controls before motion ticks
    // so the gaze target for this frame is the one the solver consumes.
    this.tickKiosk(dt);
    // Continuous motion, when active, advances on the same clock as speech.
    this.tickMotion(dt);
    // Extract current speech track from timeline if a speak event exists.
    const track = this.currentSpeechTrack();
    if (track) {
      this.speech.apply(this.definition, track, this.clock);
    }
  }

  private currentSpeechTrack(): ReturnType<typeof simpleTTS> | null {
    const log = this.timeline.log();
    const speak = [...log].reverse().find((e) => e.type === 'speak');
    if (speak && typeof speak.payload?.text === 'string') {
      return simpleTTS(speak.payload.text);
    }
    return null;
  }

  prompt(text: string, source: EventSource = 'ai'): HumanModifyResult {
    const intent: Intent = this.prompter.interpret(text);
    if (intent.type === 'expression') {
      return this.setExpression((intent.expression as SemanticExpression) ?? 'neutral', 1);
    }
    if (intent.type === 'speak') {
      return this.speak(intent.text ?? '');
    }
    if (intent.type === 'unknown') {
      return {
        cancelled: true,
        reason: `uninterpretable prompt: "${text}"`,
        affectedKernelWork: [],
        affectedSystems: [],
        dirtyRegions: [],
      };
    }
    return this.applyEvent(intentToEvent(intent, source));
  }

  applyIntent(intent: Intent, source: EventSource = 'ai'): HumanModifyResult {
    return this.applyEvent(intentToEvent(intent, source));
  }

  // --------------------------------------------------------------- timeline

  undo(): HumanModifyResult {
    const before = this.definition.serialize();
    const def = this.timeline.undo();
    if (def) this.definition = def;
    this.rebuildTemporalStateFromTimeline();
    this.rebuildAttachmentsFromTimeline();
    this.rebuildPoseFromTimeline();
    return this.resultFromChangedIds(this.changedIdsBetween(before, this.definition.serialize()));
  }

  redo(): HumanModifyResult {
    const before = this.definition.serialize();
    const def = this.timeline.redo();
    if (def) this.definition = def;
    this.rebuildTemporalStateFromTimeline();
    this.rebuildAttachmentsFromTimeline();
    this.rebuildPoseFromTimeline();
    return this.resultFromChangedIds(this.changedIdsBetween(before, this.definition.serialize()));
  }

  snapshot(): Snapshot {
    return this.timeline.snapshot();
  }

  restore(atEventIndex: number): HumanModifyResult {
    const before = this.definition.serialize();
    this.definition = this.timeline.restore(atEventIndex);
    this.rebuildTemporalStateFromTimeline();
    this.rebuildAttachmentsFromTimeline();
    this.rebuildPoseFromTimeline();
    return this.resultFromChangedIds(this.changedIdsBetween(before, this.definition.serialize()));
  }

  branch(): void {
    this.timeline.branch();
    this.rebuildTemporalStateFromTimeline();
    this.rebuildAttachmentsFromTimeline();
    this.rebuildPoseFromTimeline();
  }

  setConstraintProfile(profile: ConstraintProfile): void {
    this.constraints.setProfile(profile);
  }

  /** Number of events in history (for undo depth telemetry). */
  get historyLength(): number {
    return this.timeline.length;
  }

  /** Current position in history. */
  get historyIndex(): number {
    return this.timeline.index;
  }

  private resultFromDefinition(): HumanModifyResult {
    return {
      cancelled: false,
      affectedKernelWork: [],
      affectedSystems: [],
      dirtyRegions: this.dirty.describe(),
    };
  }

  private resultFromChangedIds(changedIds: number[]): HumanModifyResult {
    if (changedIds.length === 0) return this.resultFromDefinition();
    const kernelWork = this.compileForChange(changedIds);
    return {
      cancelled: false,
      affectedKernelWork: kernelWork,
      affectedSystems: affectedSystemsForChange(this.registry, this.deps, changedIds),
      dirtyRegions: this.dirty.describe(),
    };
  }

  private changedIdsBetween(
    before: Record<string, number>,
    after: Record<string, number>,
  ): number[] {
    const changed: number[] = [];
    for (const meta of this.registry.all()) {
      if (before[meta.path] !== after[meta.path]) changed.push(meta.id);
    }
    return changed;
  }

  private rebuildAttachmentsFromTimeline(): void {
    this.attachments.rebuild(this.timeline.log().slice(0, this.timeline.index + 1));
  }

  private applyPoseEvent(event: CharacterEvent): void {
    if (typeof event.payload?.command === 'string' && !event.payload.poses) {
      this.setPose(this.compileMotion(event.payload.command).poses);
      return;
    }
    const poses = event.payload?.poses;
    if (Array.isArray(poses)) this.setPose(poses as BonePose[]);
  }

  private applyExpressionEvent(event: CharacterEvent): void {
    const expression = event.payload?.expression;
    const intensity = event.payload?.intensity;
    if (typeof expression !== 'string') return;
    this.facial.apply(
      this.definition,
      expression as SemanticExpression,
      typeof intensity === 'number' ? intensity : 1,
    );
  }

  private kernelWorkForEvent(event: CharacterEvent): KernelWork[] {
    if (event.type === 'pose') {
      return [
        {
          kind: 'Skinning',
          vertexRanges: [{ start: 0, count: this.canonical.vertexCount }],
          propertyIds: [],
          priority: 10,
        },
      ];
    }
    if (isAttachmentEvent(event)) {
      return [{ kind: 'Attachment', vertexRanges: [], propertyIds: [], priority: 4 }];
    }
    return [];
  }

  private affectedSystemsForEvent(event: CharacterEvent): AffectedSystem[] {
    if (event.type === 'pose') {
      return [
        { system: 'Animation', directPropertyIds: [], dependentPropertyIds: [], propertyPaths: [] },
      ];
    }
    if (isAttachmentEvent(event)) {
      return [
        {
          system: 'Attachment',
          directPropertyIds: [],
          dependentPropertyIds: [],
          propertyPaths: [],
        },
      ];
    }
    return [];
  }

  private rebuildPoseFromTimeline(): void {
    const active = this.timeline.log().slice(0, this.timeline.index + 1);
    const pose = [...active].reverse().find((e) => e.type === 'pose');
    if (pose) {
      this.applyPoseEvent(pose);
    } else {
      this.setPose([]);
    }
  }

  private registerTransitionEvent(event: CharacterEvent): void {
    const path = event.payload?.path;
    const targetValue = event.payload?.targetValue;
    const targetDelta = event.payload?.targetDelta;
    const duration = event.payload?.duration;
    const curve = event.payload?.curve;
    if (typeof path !== 'string' || typeof duration !== 'number') return;
    const target =
      typeof targetValue === 'number'
        ? targetValue
        : typeof targetDelta === 'number'
          ? this.definition.get(path) + targetDelta
          : undefined;
    if (target === undefined) return;
    this.transitions = this.transitions.filter((t) => t.path !== path);
    this.transitions.push(
      createParameterTransition(
        this.definition,
        {
          id: event.id,
          path,
          targetValue: target,
          duration,
          curve: isTransitionCurve(curve) ? curve : 'linear',
        },
        this.clock,
      ),
    );
  }

  private applyAdvanceTimeEvent(event: CharacterEvent): number[] {
    const seconds = typeof event.payload?.seconds === 'number' ? event.payload.seconds : 0;
    this.clock = Math.max(0, this.clock + seconds);
    return this.applyActiveTransitions();
  }

  private applyActiveTransitions(): number[] {
    const changed: number[] = [];
    const remaining: ParameterTransition[] = [];
    for (const transition of this.transitions) {
      const id = this.registry.require(transition.path).id;
      const before = this.definition.getById(id);
      this.definition.setById(id, sampleTransition(transition, this.clock));
      if (this.definition.getById(id) !== before) changed.push(id);
      if (!transitionComplete(transition, this.clock)) remaining.push(transition);
    }
    this.transitions = remaining;
    return changed;
  }

  private rebuildTemporalStateFromTimeline(): void {
    this.definition = this.timeline.baseDefinition();
    this.clock = 0;
    this.transitions = [];
    const active = this.timeline.log().slice(0, this.timeline.index + 1);
    for (const event of active) {
      applyEventToDefinition(this.definition, event);
      if (event.type === 'expression') this.applyExpressionEvent(event);
      if (event.type === 'transition') this.registerTransitionEvent(event);
      if (event.type === 'advanceTime') this.applyAdvanceTimeEvent(event);
    }
  }
}

function isAttachmentEvent(event: CharacterEvent): boolean {
  return event.type === 'wear' || event.type === 'addTattoo' || event.type === 'removeAttachment';
}

function isTransitionCurve(value: unknown): value is TransitionCurve {
  return value === 'linear' || value === 'ease' || value === 'biological';
}
