import { PropertyRegistry } from './core/schema/registry.js';
import { HumanDefinition } from './core/schema/human-definition.js';
import { CharacterEvent, EventSource } from './core/events/character-event.js';
import { Snapshot } from './core/timeline/character-timeline.js';
import { ConstraintSolver, ConstraintProfile } from './core/constraints/solver.js';
import { KernelWork } from './compiler/delta/delta-compiler.js';
import { AffectedSystem } from './compiler/dependency/affected-systems.js';
import { CanonicalHuman } from './geometry/canonical/canonical-human.js';
import type { CanonicalHumanProvider } from './geometry/canonical/canonical-provider.js';
import { HumanProfiler } from './gpu/profiler/profiler.js';
import { SemanticExpression } from './animation/facial/facial-expression.js';
import { SemanticLOD } from './lod/index.js';
import { Intent } from './ai/prompt/interpreter.js';
import { WebGpuHumanPipeline } from './render/webgpu/pipeline.js';
import { AnatomyDimensions } from './anatomy/parametric/parametric-anatomy.js';
import { BoneDef } from './anatomy/skeleton/skeleton.js';
import { AnimationChannel, BonePose } from './animation/skeleton/skeletal-animation.js';
import { HumanAttachment, AttachmentAnchor } from './attachments/attachment-system.js';
import { StrandHairGeometry, StrandHairOptions } from './surface/hair/strand-hair.js';
import { HumanSdfField } from './physics/sdf/human-sdf.js';
import { ClothMesh, ClothStepOptions } from './physics/cloth/cloth-sim.js';
import { SkinResidualField, SkinResidualOptions } from './surface/skin/neural-skin.js';
import { MotionPlan } from './animation/motion/motion-compiler.js';
import { PerceptualValidationReport } from './validation/perceptual-validator.js';
import { TattooDecal } from './surface/tattoo/tattoo-decal.js';
import { GarmentMesh } from './surface/clothing/garment.js';
import { InternalAnatomyMode, InternalAnatomyView } from './anatomy/internal/internal-anatomy.js';
import { TransitionCurve } from './core/transitions/parameter-transition.js';
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
/**
 * The ultimate character API. Everything resolves through a single event
 * architecture. One canonical human is loaded; each Human instance is a
 * persistent semantic character compiled into minimal GPU work.
 */
export declare class Human {
    readonly registry: PropertyRegistry;
    private definition;
    private timeline;
    private constraints;
    private deps;
    private delta;
    private dirty;
    private identity;
    private canonical;
    private morphs;
    private morphDriver;
    private morphKernel;
    private shapeSpace;
    private correctives;
    private correctiveMorphInputs;
    /** Vertex ids affected by the shape bases currently contributing (P17). */
    private currentAffectedVertices;
    readonly profiler: HumanProfiler;
    private facial;
    private speech;
    private semanticLod;
    private perceptualLod;
    private prompter;
    private animation;
    private motion;
    private currentPose;
    private transitions;
    private skinInfluences;
    private clock;
    private gpu;
    private attachments;
    private constructor();
    /** Human Shape Space V0.1: register the 10 identity controls + combination correctives. */
    private registerShapeSpace;
    /**
     * Tell MorphDriver which property (or corrective combination) drives each
     * compiled shape morph, so the existing GPU/CPU morph path evaluates the same
     * coefficients the shape space computes. Correctives use a continuous product
     * weight across their inputs (P11).
     */
    private registerShapeMorphsInDriver;
    /**
     * Pose/skeleton correctives (P15): bone-driven morphs reach the GPU/CPU morph
     * pipeline exactly like property shapes. The supply of pose comes from the
     * current skeleton deflection via MorphDriver.setPose(), which Human.setPose()
     * refreshes each time the character is posed.
     */
    private registerPoseCorrectives;
    /**
     * Number of corrective rules meaningfully active (coefficient threshold) under
     * the current definition — P11/P17 telemetry. 0 when none are active.
     */
    private contributingCorrectiveRules;
    /** Full coefficient map (property ratio about neutral) for every registered basis. */
    private shapeCoefficients;
    /** Create a human asynchronously (GPU device optional). */
    static create(opts?: HumanCreateOptions): Promise<Human>;
    private registerCanonicalMorphs;
    get definitionRef(): HumanDefinition;
    get canonicalRef(): CanonicalHuman;
    get constraintsRef(): ConstraintSolver;
    get semanticLodRef(): SemanticLOD;
    get(path: string): number;
    /**
     * Recompute the accumulated sparse-morph deltas for the current definition.
     * Used by renderers (CPU reference / demo) and tests to show that only
     * affected geometry moves. Linear shape bases + combination correctives all
     * flow through the same sparse morph pipeline.
     */
    computeMorphDelta(): Float32Array;
    /**
     * Vertex ids the shape space currently displaces (P17 localized-edit proof).
     * Consumed by the demo overlay to highlight affected geometry.
     */
    affectedVertexIds(): Set<number>;
    /** Number of corrective rules active under the current definition (P11/P17). */
    activeCorrectiveCount(): number;
    /** The WebGPU pipeline, if this Human was created with a GPU device. */
    get gpuPipeline(): WebGpuHumanPipeline | null;
    /** Names of all registered sparse morphs (telemetry / part inspection). */
    morphNames(): string[];
    /**
     * Resolve the current definition into concrete, measured body dimensions
     * (the anatomical-constraint side of the pipeline). Deterministic.
     */
    solveAnatomy(): AnatomyDimensions;
    /** Anatomical-plausibility constraints for the current body shape. */
    anatomyConstraints(): import("./anatomy/parametric/parametric-anatomy.js").AnatomyConstraint[];
    /** Aggregate anatomy satisfaction, 0..1. */
    anatomyScore(): number;
    /**
     * The parametrically-placed T-pose skeleton whose joints match the resolved
     * anatomy (and therefore the deformed block geometry).
     */
    parametricSkeleton(): BoneDef[];
    /** Register an animation replay channel list under a clip name. */
    addClip(name: string, channels: AnimationChannel[]): void;
    /** Set the blend weight of a named clip (0 = off, 1 = full). */
    playClip(name: string, weight: number): void;
    /** Sample the active clips at time `t` into per-bone poses. */
    samplePose(t: number): BonePose[];
    /**
     * Apply a set of bone poses to the character: updates the GPU skin matrix
     * buffer (when a GPU pipeline exists) and the CPU skin reference. A rest pose
     * (empty poses) leaves the mesh unchanged.
     */
    setPose(poses: BonePose[]): void;
    /** Sample the current clips at time `t` and apply the resulting pose. */
    animate(t: number): void;
    compileMotion(command: string): MotionPlan;
    perform(command: string, source?: EventSource): HumanModifyResult;
    /**
     * CPU skinning reference: transform the canonical base positions by the
     * current pose's bone matrices. At rest this equals the base geometry, so
     * rotating a limb bone moves exactly its vertices.
     */
    skinScene(): Float32Array;
    /**
     * CPU skinning reference for normals: transforms the canonical base normals
     * by the current pose's rotation matrices (see `skinNormalsCPU`). Returns a
     * Float32Array of length vertexCount*3.
     */
    skinNormals(): Float32Array;
    /** Current non-geometry attachments anchored to semantic regions/bones. */
    listAttachments(): HumanAttachment[];
    addAttachment(attachment: HumanAttachment, source?: EventSource): HumanModifyResult;
    addTattoo(id: string, anchor: AttachmentAnchor, data?: Record<string, unknown>): HumanModifyResult;
    wear(id: string, anchor: AttachmentAnchor, data?: Record<string, unknown>): HumanModifyResult;
    removeAttachment(id: string, source?: EventSource): HumanModifyResult;
    attachmentPosition(id: string): import("./index.js").Vec3 | null;
    /** Deterministic CPU strand-hair prototype generated from HDL hair params. */
    hairGeometry(options?: StrandHairOptions): StrandHairGeometry;
    /** Human-specific collision SDF prototype from anatomy + skeleton capsules. */
    sdfField(): HumanSdfField;
    sdfDistance(point: {
        x: number;
        y: number;
        z: number;
    }): number;
    /** Build a deterministic torso cloth panel for CPU cloth simulation. */
    createCloth(width?: number, height?: number): ClothMesh;
    simulateCloth(mesh: ClothMesh, steps: number, options?: ClothStepOptions): ClothMesh;
    /** Deterministic procedural residual layer for skin color/roughness/detail. */
    skinResiduals(options?: SkinResidualOptions): SkinResidualField;
    /** Project tattoo attachments to stable semantic-region decal samples. */
    tattooDecals(): TattooDecal[];
    /** Generate separate wearable garment meshes from current wear attachments. */
    garments(): GarmentMesh[];
    /** Non-mutating perceptual validation; corrective requests are suggestions only. */
    validatePerceptual(): PerceptualValidationReport;
    /** Lazily derive modular internal-anatomy display data from persistent state. */
    internalAnatomy(mode?: InternalAnatomyMode): InternalAnatomyView;
    /** Upload current params + morph weights to the GPU. No-op without a device. */
    uploadGpu(definition?: HumanDefinition): void;
    /**
     * Encode one full frame into `view`: morph-deform compute, then draw the
     * deformed mesh. Returns the finished command buffer (submit it). Returns
     * null when this Human has no GPU pipeline.
     */
    encodeFrame(view: GPUTextureView, width: number, height: number): GPUCommandBuffer | null;
    /**
     * Convenience for canvas hosts: encode + submit one frame to the device
     * queue, drawing into the current texture of a WebGPU canvas context.
     * Returns false when no GPU pipeline exists.
     */
    renderToContext(ctx: GPUCanvasContext): boolean;
    private device;
    /**
     * Apply any CharacterEvent through the single event architecture. This is the
     * ONLY mutation path (AI, UI, automation, simulation, external all use it).
     */
    applyEvent(event: CharacterEvent, opts?: {
        identityBudget?: {
            amount: number;
            allowedDimensions?: string[];
        };
    }): HumanModifyResult;
    private compileForChange;
    /** Central modifier: single change. */
    modify(changes: Record<string, number>, source?: EventSource): HumanModifyResult;
    /** Non-destructive adjust (multiply). */
    adjust(path: string, factor: number, source?: EventSource): HumanModifyResult;
    /** Schedule a deterministic time-based property transition through events. */
    transition(path: string, targetValue: number, duration: number, curve?: TransitionCurve, source?: EventSource): HumanModifyResult;
    /** Advance event time so active parameter transitions update the definition. */
    advanceTime(seconds: number, source?: EventSource): HumanModifyResult;
    setExpression(expr: SemanticExpression, intensity?: number): HumanModifyResult;
    speak(text: string): HumanModifyResult;
    /** Advance speech/simulation time. */
    update(dt: number): void;
    private currentSpeechTrack;
    prompt(text: string, source?: EventSource): HumanModifyResult;
    applyIntent(intent: Intent, source?: EventSource): HumanModifyResult;
    undo(): HumanModifyResult;
    redo(): HumanModifyResult;
    snapshot(): Snapshot;
    restore(atEventIndex: number): HumanModifyResult;
    branch(): void;
    setConstraintProfile(profile: ConstraintProfile): void;
    /** Number of events in history (for undo depth telemetry). */
    get historyLength(): number;
    /** Current position in history. */
    get historyIndex(): number;
    private resultFromDefinition;
    private resultFromChangedIds;
    private changedIdsBetween;
    private rebuildAttachmentsFromTimeline;
    private applyPoseEvent;
    private applyExpressionEvent;
    private kernelWorkForEvent;
    private affectedSystemsForEvent;
    private rebuildPoseFromTimeline;
    private registerTransitionEvent;
    private applyAdvanceTimeEvent;
    private applyActiveTransitions;
    private rebuildTemporalStateFromTimeline;
}
//# sourceMappingURL=human.d.ts.map