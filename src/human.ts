import { PropertyRegistry } from "./core/schema/registry";
import { createDefaultRegistry } from "./core/schema/descriptors";
import { HumanDefinition } from "./core/schema/human-definition";
import { CharacterEvent, createEvent, applyEventToDefinition, EventSource } from "./core/events/character-event";
import { CharacterTimeline, Snapshot } from "./core/timeline/character-timeline";
import { ConstraintSolver, ConstraintProfile } from "./core/constraints/solver";
import { DependencyGraph } from "./compiler/dependency/dependency-graph";
import { DeltaCompiler, KernelWork } from "./compiler/delta/delta-compiler";
import { AffectedSystem, affectedSystemsForChange } from "./compiler/dependency/affected-systems";
import { DirtyRegionTracker } from "./compiler/delta/dirty-regions";
import { IdentitySolver } from "./identity/solver/identity-solver";
import { CanonicalHuman, RegionName } from "./geometry/canonical/canonical-human";
import { SparseMorphSet } from "./geometry/morph/sparse-morph";
import { MorphDriver } from "./geometry/morph/morph-driver";
import { MorphKernel } from "./gpu/kernels/morph-kernel";
import { HumanProfiler, countDirtyVertices } from "./gpu/profiler/profiler";
import { FacialExpressionSystem, SemanticExpression } from "./animation/facial/facial-expression";
import { SpeechSolver, simpleTTS } from "./animation/speech/speech-solver";
import { SemanticLOD, PerceptualLOD } from "./lod";
import { DeterministicPromptInterpreter, Intent, intentToEvent } from "./ai/prompt/interpreter";
import { WebGpuHumanPipeline } from "./render/webgpu/pipeline";
import { resolveAnatomy, AnatomyDimensions, validateAnatomy, anatomySatisfaction } from "./anatomy/parametric/parametric-anatomy";
import { placeSkeletonFromDefinition, BoneDef } from "./anatomy/skeleton/skeleton";
import { combinedSkinMatrices } from "./anatomy/skeleton/bone-matrix";
import { SkeletalAnimation, AnimationChannel, BonePose } from "./animation/skeleton/skeletal-animation";
import { buildInfluences, skinMeshCPU, skinNormalsCPU } from "./gpu/kernels/skin-mesh";
import { AttachmentSystem, HumanAttachment, AttachmentKind, AttachmentAnchor } from "./attachments/attachment-system";
import { generateStrandHair, StrandHairGeometry, StrandHairOptions } from "./surface/hair/strand-hair";
import { buildHumanSdfField, HumanSdfField } from "./physics/sdf/human-sdf";
import { ClothMesh, ClothStepOptions, createTorsoCloth, simulateCloth } from "./physics/cloth/cloth-sim";
import { generateSkinResiduals, SkinResidualField, SkinResidualOptions } from "./surface/skin/neural-skin";
import { MotionCompiler, MotionPlan } from "./animation/motion/motion-compiler";
import { PerceptualValidationReport, validatePerceptualHuman } from "./validation/perceptual-validator";
import { projectTattooDecals, TattooDecal } from "./surface/tattoo/tattoo-decal";
import { generateGarments, GarmentMesh } from "./surface/clothing/garment";
import { buildInternalAnatomyView, InternalAnatomyMode, InternalAnatomyView } from "./anatomy/internal/internal-anatomy";
import { createParameterTransition, ParameterTransition, sampleTransition, transitionComplete, TransitionCurve } from "./core/transitions/parameter-transition";

export interface HumanCreateOptions {
  registry?: PropertyRegistry;
  seed?: Record<string, number>;
  device?: GPUDevice;
  format?: GPUTextureFormat;
}

export interface HumanModifyResult {
  cancelled: boolean;
  reason?: string;
  affectedKernelWork: KernelWork[];
  affectedSystems: AffectedSystem[];
  dirtyRegions: string[];
}

const DEFAULT_BONE_NAMES = [
  "root", "pelvis", "spine_01", "spine_02", "chest", "neck", "head",
  "clavicle_l", "clavicle_r",
  "upperarm_l", "upperarm_r", "forearm_l", "forearm_r", "hand_l", "hand_r",
  "thigh_l", "thigh_r", "shin_l", "shin_r", "foot_l", "foot_r",
];

function cap(s: string): string {
  const [main, side] = s.split("_");
  const cased = main.charAt(0).toUpperCase() + main.slice(1);
  return side === "l" || side === "r" ? cased + side.toUpperCase() : cased;
}

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
  private morphDriver: MorphDriver;
  private morphKernel: MorphKernel;
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
    this.canonical = new CanonicalHuman(DEFAULT_BONE_NAMES);
    this.delta = new DeltaCompiler(this.registry, this.deps, this.canonical);
    this.morphs = new SparseMorphSet(this.canonical);
    this.morphDriver = new MorphDriver(this.registry);
    this.morphKernel = new MorphKernel(this.morphs, this.morphDriver, opts.device ?? null);
    this.registerCanonicalMorphs();
    this.device = opts.device ?? null;
    if (opts.device) {
      this.gpu = new WebGpuHumanPipeline(this.canonical, this.morphs, this.morphDriver, {
        device: opts.device,
        format: opts.format,
        paramByteSize: this.registry.sizeBytes,
        skeleton: this.parametricSkeleton(),
      });
    }
  }

  /** Create a human asynchronously (GPU device optional). */
  static async create(opts: HumanCreateOptions = {}): Promise<Human> {
    return new Human(opts);
  }

  private registerCanonicalMorphs(): void {
    // Nose width: push nose vertices outward along X (region-localized to nose).
    this.morphs.add("noseWidth", "nose", (vx) => {
      return { dx: Math.sign(vx) * 0.03, dy: 0, dz: 0 };
    });
    // Jaw width: widen jaw region laterally (region-localized to jaw).
    this.morphs.add("jawWidth", "jaw", (vx) => {
      return { dx: Math.sign(vx) * 0.05, dy: 0, dz: 0 };
    });
    // Eye spacing: separate the body eye boxes laterally.
    this.morphs.add("eyeSpacing", "eyes", (vx) => {
      return { dx: Math.sign(vx) * 0.02, dy: 0, dz: 0 };
    });
    // Same semantic spread to the detailed eyeball parts (sclera + iris/pupil).
    this.morphs.add("eyeSpacingSclera", "eye_sclera", (vx) => {
      return { dx: Math.sign(vx) * 0.02, dy: 0, dz: 0 };
    });
    this.morphs.add("eyeSpacingIris", "eye_iris", (vx) => {
      return { dx: Math.sign(vx) * 0.02, dy: 0, dz: 0 };
    });
    this.morphs.add("muscularity", "torso", (_vx, vy) => {
      const up = 1 + (vy - 1.5) * 0.5;
      return { dx: 0, dy: 0, dz: up * 0.05 * Math.sign(_vx) };
    });
    this.morphs.add("mouthWidth", "mouth", (vx) => ({ dx: Math.sign(vx) * 0.02, dy: 0, dz: 0 }));
    // Jaw open: lower the tongue and widen the mouth cavity (part-localized).
    this.morphs.add("jawOpen", "tongue", (_vx, vy) => ({ dx: 0, dy: -0.02 * (vy < 1.79 ? 1 : 0.4), dz: 0 }));
    this.morphs.add("jawOpenCavity", "mouth_cavity", (_vx, vy, vz) => ({
      dx: 0,
      dy: -0.015 * (vz > 0.18 ? 1 : 0.3),
      dz: 0,
    }));

    // ---- Parametric anatomy corrective morphs (identity body properties).
    // Height: vertical scale of the axial + limb regions about the ground.
    this.morphs.add("heightTorso", "torso", (_x, vy) => ({ dx: 0, dy: vy, dz: 0 }));
    this.morphs.add("heightNeck", "neck", (_x, vy) => ({ dx: 0, dy: vy, dz: 0 }));
    this.morphs.add("heightHead", "head", (_x, vy) => ({ dx: 0, dy: vy, dz: 0 }));
    for (const b of ["upperarm_l", "upperarm_r", "forearm_l", "forearm_r", "thigh_l", "thigh_r", "shin_l", "shin_r"] as RegionName[]) {
      this.morphs.add(`height${cap(b)}`, b, (_x, vy) => ({ dx: 0, dy: vy, dz: 0 }));
    }
    // Shoulder width: lateral scale of the torso (shoulders) about x=0.
    this.morphs.add("shoulderWidth", "torso", (vx) => ({ dx: vx * 0.75, dy: 0, dz: 0 }));
    // Waist / body fat: torso girth (rounding) about the spine axis.
    this.morphs.add("waist", "torso", (vx, _v, vz) => ({ dx: vx * 0.5, dy: 0, dz: vz * 0.5 }));
    this.morphs.add("bodyFat", "torso", (vx, _v, vz) => ({ dx: vx * 0.3, dy: 0, dz: vz * 0.3 }));
    // Spine / neck length scaling about the trunk origin region.
    this.morphs.add("spine", "torso", (_x, vy) => ({ dx: 0, dy: (vy - 1.5) * 0.5, dz: 0 }));
    this.morphs.add("neckScale", "neck", (_x, vy) => ({ dx: 0, dy: (vy - 1.8), dz: 0 }));
  }

  // ---------------------------------------------------------------- getters

  get definitionRef(): HumanDefinition {
    return this.definition;
  }
  get canonicalRef(): CanonicalHuman {
    return this.canonical;
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
   * affected geometry moves.
   */
  computeMorphDelta(): Float32Array {
    const delta = new Float32Array(this.canonical.vertexCount * 3);
    this.morphKernel.accumulate(this.definition, delta);
    return delta;
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
    if (this.gpu) this.gpu.setPose(poses);
  }

  /** Sample the current clips at time `t` and apply the resulting pose. */
  animate(t: number): void {
    this.setPose(this.samplePose(t));
  }

  compileMotion(command: string): MotionPlan {
    return this.motion.compile(command, this.parametricSkeleton());
  }

  perform(command: string, source: EventSource = "ui"): HumanModifyResult {
    const plan = this.compileMotion(command);
    if (plan.kind === "unknown") {
      return { cancelled: true, reason: plan.reason, affectedKernelWork: [], affectedSystems: [], dirtyRegions: [] };
    }
    return this.applyEvent(createEvent("pose", source, { payload: { command, plan, poses: plan.poses } }));
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
    return skinMeshCPU(this.canonical.baseGeometry().positions, this.skinInfluences, matrices);
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

  addAttachment(attachment: HumanAttachment, source: EventSource = "api"): HumanModifyResult {
    const eventType = attachment.kind === "tattoo" ? "addTattoo" : "wear";
    return this.applyEvent(createEvent(eventType, source, { payload: { attachment } }));
  }

  addTattoo(id: string, anchor: AttachmentAnchor, data: Record<string, unknown> = {}): HumanModifyResult {
    return this.addAttachment({ id, kind: "tattoo", anchor, data }, "api");
  }

  wear(id: string, anchor: AttachmentAnchor, data: Record<string, unknown> = {}): HumanModifyResult {
    return this.addAttachment({ id, kind: "wearable", anchor, data }, "api");
  }

  removeAttachment(id: string, source: EventSource = "api"): HumanModifyResult {
    return this.applyEvent(createEvent("removeAttachment", source, { payload: { id } }));
  }

  attachmentPosition(id: string) {
    const attachment = this.attachments.get(id);
    if (!attachment) return null;
    return this.attachments.resolve(
      attachment,
      this.canonical,
      this.parametricSkeleton(),
      this.currentPose,
      this.computeMorphDelta()
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
  internalAnatomy(mode: InternalAnatomyMode = "anatomy"): InternalAnatomyView {
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
  applyEvent(event: CharacterEvent, opts: { identityBudget?: { amount: number; allowedDimensions?: string[] } } = {}): HumanModifyResult {
    // 1. Identity preservation gate.
    const gate = this.identity.gate(event, this.definition, opts.identityBudget);
    if (!gate.allowed) {
      return { cancelled: true, reason: gate.reason, affectedKernelWork: [], affectedSystems: [], dirtyRegions: [] };
    }

    // 2. Functional application plus event-specific state changes.
    const beforeDefinition = this.definition.serialize();
    const propChanges = applyEventToDefinition(this.definition, event) ?? [];

    // 3. Timeline records it (event sourcing + undo/redo).
    this.timeline.push(event);
    this.attachments.applyEvent(event);
    if (event.type === "expression") this.applyExpressionEvent(event);
    if (event.type === "pose") this.applyPoseEvent(event);
    if (event.type === "transition") this.registerTransitionEvent(event);
    if (event.type === "advanceTime") propChanges.push(...this.applyAdvanceTimeEvent(event));
    for (const id of this.changedIdsBetween(beforeDefinition, this.definition.serialize())) {
      if (!propChanges.includes(id)) propChanges.push(id);
    }

    // 4. Constraint validation of resulting definition.
    const constraint = this.constraints.validate(this.definition);
    if (constraint.satisfaction < 0.2) {
      return { cancelled: true, reason: "constraint violation: " + constraint.messages.join("; "), affectedKernelWork: [], affectedSystems: [], dirtyRegions: [] };
    }

    // 5. Mark dirty + compile minimal GPU work.
    const kernelWork = [...this.compileForChange(propChanges), ...this.kernelWorkForEvent(event)];
    const affectedSystems = [...affectedSystemsForChange(this.registry, this.deps, propChanges), ...this.affectedSystemsForEvent(event)];

    // 6. Run morph compute (CPU reference path).
    const delta = new Float32Array(this.canonical.vertexCount * 3);
    this.morphKernel.accumulate(this.definition, delta);

    const dirtyRegionNames = isAttachmentEvent(event) ? ["Attachment"] : event.type === "pose" ? ["Animation"] : this.dirty.describe();
    const verticesModified = countDirtyVertices(this.canonical, dirtyRegionNames as never[]);
    this.profiler.record({
      computePasses: kernelWork.length,
      dirtyRegions: dirtyRegionNames,
      verticesModified,
      morphDeltaProcessed: this.morphKernel.deltaCount,
      cpuTimeMs: 0,
    });

    return { cancelled: false, affectedKernelWork: kernelWork, affectedSystems, dirtyRegions: dirtyRegionNames };
  }

  private compileForChange(changedIds: number[]): KernelWork[] {
    for (const id of changedIds) this.dirty.touch(id);
    return this.delta.compile(changedIds);
  }

  /** Central modifier: single change. */
  modify(changes: Record<string, number>, source: EventSource = "ui"): HumanModifyResult {
    return this.applyEvent(createEvent("set", source, { changes }));
  }

  /** Non-destructive adjust (multiply). */
  adjust(path: string, factor: number, source: EventSource = "ui"): HumanModifyResult {
    return this.applyEvent(createEvent("adjust", source, { path, factor }));
  }

  /** Schedule a deterministic time-based property transition through events. */
  transition(path: string, targetValue: number, duration: number, curve: TransitionCurve = "linear", source: EventSource = "api"): HumanModifyResult {
    return this.applyEvent(createEvent("transition", source, { payload: { path, targetValue, duration, curve } }));
  }

  /** Advance event time so active parameter transitions update the definition. */
  advanceTime(seconds: number, source: EventSource = "simulation"): HumanModifyResult {
    return this.applyEvent(createEvent("advanceTime", source, { payload: { seconds } }));
  }

  setExpression(expr: SemanticExpression, intensity = 1): HumanModifyResult {
    return this.applyEvent(createEvent("expression", "ui", { payload: { expression: expr, intensity } }));
  }

  speak(text: string): HumanModifyResult {
    const track = simpleTTS(text);
    return this.applyEvent(createEvent("speak", "ui", { payload: { text, track } }));
  }

  /** Advance speech/simulation time. */
  update(dt: number): void {
    this.advanceTime(dt, "simulation");
    // Extract current speech track from timeline if a speak event exists.
    const track = this.currentSpeechTrack();
    if (track) {
      this.speech.apply(this.definition, track, this.clock);
    }
  }

  private currentSpeechTrack(): ReturnType<typeof simpleTTS> | null {
    const log = this.timeline.log();
    const speak = [...log].reverse().find((e) => e.type === "speak");
    if (speak && typeof speak.payload?.text === "string") {
      return simpleTTS(speak.payload.text);
    }
    return null;
  }

  prompt(text: string, source: EventSource = "ai"): HumanModifyResult {
    const intent: Intent = this.prompter.interpret(text);
    if (intent.type === "expression") {
      return this.setExpression((intent.expression as SemanticExpression) ?? "neutral", 1);
    }
    if (intent.type === "speak") {
      return this.speak(intent.text ?? "");
    }
    if (intent.type === "unknown") {
      return { cancelled: true, reason: `uninterpretable prompt: "${text}"`, affectedKernelWork: [], affectedSystems: [], dirtyRegions: [] };
    }
    return this.applyEvent(intentToEvent(intent, source));
  }

  applyIntent(intent: Intent, source: EventSource = "ai"): HumanModifyResult {
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
    return { cancelled: false, affectedKernelWork: [], affectedSystems: [], dirtyRegions: this.dirty.describe() };
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

  private changedIdsBetween(before: Record<string, number>, after: Record<string, number>): number[] {
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
    if (typeof event.payload?.command === "string" && !event.payload.poses) {
      this.setPose(this.compileMotion(event.payload.command).poses);
      return;
    }
    const poses = event.payload?.poses;
    if (Array.isArray(poses)) this.setPose(poses as BonePose[]);
  }

  private applyExpressionEvent(event: CharacterEvent): void {
    const expression = event.payload?.expression;
    const intensity = event.payload?.intensity;
    if (typeof expression !== "string") return;
    this.facial.apply(this.definition, expression as SemanticExpression, typeof intensity === "number" ? intensity : 1);
  }

  private kernelWorkForEvent(event: CharacterEvent): KernelWork[] {
    if (event.type === "pose") {
      return [{ kind: "Skinning", vertexRanges: [{ start: 0, count: this.canonical.vertexCount }], propertyIds: [], priority: 10 }];
    }
    if (isAttachmentEvent(event)) {
      return [{ kind: "Attachment", vertexRanges: [], propertyIds: [], priority: 4 }];
    }
    return [];
  }

  private affectedSystemsForEvent(event: CharacterEvent): AffectedSystem[] {
    if (event.type === "pose") {
      return [{ system: "Animation", directPropertyIds: [], dependentPropertyIds: [], propertyPaths: [] }];
    }
    if (isAttachmentEvent(event)) {
      return [{ system: "Attachment", directPropertyIds: [], dependentPropertyIds: [], propertyPaths: [] }];
    }
    return [];
  }

  private rebuildPoseFromTimeline(): void {
    const active = this.timeline.log().slice(0, this.timeline.index + 1);
    const pose = [...active].reverse().find((e) => e.type === "pose");
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
    if (typeof path !== "string" || typeof duration !== "number") return;
    const target = typeof targetValue === "number"
      ? targetValue
      : typeof targetDelta === "number"
        ? this.definition.get(path) + targetDelta
        : undefined;
    if (target === undefined) return;
    this.transitions = this.transitions.filter((t) => t.path !== path);
    this.transitions.push(createParameterTransition(this.definition, {
      id: event.id,
      path,
      targetValue: target,
      duration,
      curve: isTransitionCurve(curve) ? curve : "linear",
    }, this.clock));
  }

  private applyAdvanceTimeEvent(event: CharacterEvent): number[] {
    const seconds = typeof event.payload?.seconds === "number" ? event.payload.seconds : 0;
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
      if (event.type === "expression") this.applyExpressionEvent(event);
      if (event.type === "transition") this.registerTransitionEvent(event);
      if (event.type === "advanceTime") this.applyAdvanceTimeEvent(event);
    }
  }
}

function isAttachmentEvent(event: CharacterEvent): boolean {
  return event.type === "wear" || event.type === "addTattoo" || event.type === "removeAttachment";
}

function isTransitionCurve(value: unknown): value is TransitionCurve {
  return value === "linear" || value === "ease" || value === "biological";
}
