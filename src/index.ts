// Daytona WebGPU Avatar — public SDK surface.

export { Human } from "./human";
export type { HumanCreateOptions, HumanModifyResult } from "./human";

// Core
export { HumanDefinition } from "./core/schema/human-definition";
export { PropertyRegistry, makePropertyId, propertyCategory, alignUp } from "./core/schema/registry";
export type { PropertyDescriptor } from "./core/schema/registry";
export { DEFAULT_PROPERTY_DESCRIPTORS, createDefaultRegistry } from "./core/schema/descriptors";
export {
  PropertyCategory,
  PersistenceType,
  IdentityImportance,
  PROPERTY_CATEGORIES,
} from "./core/schema/property";
export type { PropertyMeta, PropertyType } from "./core/schema/property";

// Events & timeline
export { createEvent, applyEventToDefinition } from "./core/events/character-event";
export type { CharacterEvent, CharacterEventType, EventSource } from "./core/events/character-event";
export { CharacterTimeline } from "./core/timeline/character-timeline";
export type { Snapshot } from "./core/timeline/character-timeline";

// Constraints
export { ConstraintSolver, CONSTRAINT_PROFILES } from "./core/constraints/solver";
export type { ConstraintProfile, ConstraintResult } from "./core/constraints/types";

// Math
export { vec3, IDENTITY_QUAT, identityMatrix, multiplyMatrices } from "./core/math/vec";
export type { Vec3, Vec4, Quat } from "./core/math/vec";
export { DependencyGraph } from "./compiler/dependency/dependency-graph";
export type { DependencyNode } from "./compiler/dependency/dependency-graph";
export { DeltaCompiler, CATEGORY_TO_KERNEL } from "./compiler/delta/delta-compiler";
export type { KernelWork, KernelKind } from "./compiler/delta/delta-compiler";
export { DirtyRegionTracker } from "./compiler/delta/dirty-regions";
export { ComputeGraph } from "./compiler/compute/compute-graph";
export type { GraphNode } from "./compiler/compute/compute-graph";

// Anatomy
export { defaultSkeleton, placeSkeletonFromDefinition } from "./anatomy/skeleton/skeleton";
export type { BoneDef, BoneName, JointLimits } from "./anatomy/skeleton/skeleton";
export { resolveAnatomy, validateAnatomy, anatomySatisfaction } from "./anatomy/parametric/parametric-anatomy";
export type { AnatomyDimensions, AnatomyConstraint } from "./anatomy/parametric/parametric-anatomy";
export { buildBoneMatrices, combinedSkinMatrices, composeMatrix, invertMatrix } from "./anatomy/skeleton/bone-matrix";
export { buildInfluences, skinMeshCPU, skinNormalsCPU, normalizeWeights, MAX_INFLUENCES } from "./gpu/kernels/skin-mesh";
export type { SkinInfluences } from "./gpu/kernels/skin-mesh";

// Identity
export { IdentitySolver } from "./identity/solver/identity-solver";
export type { IdentityBudget, IdentityChangeGate } from "./identity/solver/identity-solver";

// Geometry
export { CanonicalHuman, generateBlockHuman } from "./geometry/canonical/canonical-human";
export type { RegionName, Vertex, MorphDelta, SparseMorph, PartGeometry, PartKind } from "./geometry/canonical/canonical-human";
export { SparseMorphSet } from "./geometry/morph/sparse-morph";
export { MorphDriver } from "./geometry/morph/morph-driver";

// GPU
export { createDeviceAndProfile } from "./gpu/device/capabilities";
export type { DeviceCapabilities, DeviceProfile } from "./gpu/device/capabilities";
export { CharacterGpuState } from "./gpu/buffers/character-gpu-state";
export { MorphKernel } from "./gpu/kernels/morph-kernel";
export { GpuMorphDeform } from "./gpu/kernels/gpu-morph-deform";
export { packSparseMorphs, setMorphWeights } from "./gpu/morph/gpu-morph-buffers";
export type { PackedMorphBuffers, GpuMorphLayout } from "./gpu/morph/gpu-morph-buffers";
export { HumanProfiler, countDirtyVertices } from "./gpu/profiler/profiler";
export type { FrameMetrics } from "./gpu/profiler/profiler";
export { GpuScheduler } from "./gpu/scheduler/gpu-scheduler";
export type { ScheduleDecision, ScheduleItem } from "./gpu/scheduler/gpu-scheduler";

// Render
export { placeholderShaders, HUMAN_PARAM_STRUCT, buildShaderModule } from "./render/wgsl/shaders";
export type { HumanRendererShaders } from "./render/wgsl/shaders";
export { WebGPURenderer, HUMAN_RENDER_WGSL, buildCameraMatrices } from "./render/webgpu/renderer";
export type { CameraMatrices, RenderPart } from "./render/webgpu/renderer";
export { WebGpuHumanPipeline } from "./render/webgpu/pipeline";
export type { WebGpuHumanPipelineOptions } from "./render/webgpu/pipeline";
export { WebGL2HumanRenderer, buildWebGL2RenderParts, webglPartColor } from "./render/webgl2/renderer";
export type { WebGL2RenderPart } from "./render/webgl2/renderer";
export { MORPH_COMPUTE_WGSL } from "./render/wgsl/morph-wgsl";

// Animation
export { SkeletalAnimation, sampleChannel, quatFromEulerDeg as quatFromEuler } from "./animation/skeleton/skeletal-animation";
export type { BonePose, AnimationChannel } from "./animation/skeleton/skeletal-animation";
export { MotionCompiler, compileMotionCommand } from "./animation/motion/motion-compiler";
export type { MotionKind, MotionPlan } from "./animation/motion/motion-compiler";
export { FacialExpressionSystem } from "./animation/facial/facial-expression";
export type { SemanticExpression } from "./animation/facial/facial-expression";
export { SpeechSolver, simpleTTS } from "./animation/speech/speech-solver";
export type { SpeechTrack, Phoneme, Viseme } from "./animation/speech/speech-solver";

// Attachments
export { AttachmentSystem } from "./attachments/attachment-system";
export type { HumanAttachment, AttachmentAnchor, AttachmentKind } from "./attachments/attachment-system";

// Surface
export { generateStrandHair, countHairVertices } from "./surface/hair/strand-hair";
export type { StrandHairGeometry, HairStrand, HairStrandPoint, StrandHairOptions } from "./surface/hair/strand-hair";
export { HumanSdfField, buildHumanSdfField } from "./physics/sdf/human-sdf";
export type { HumanSdfPrimitive, HumanSdfPrimitiveKind, HumanSdfSample } from "./physics/sdf/human-sdf";
export { createTorsoCloth, stepCloth, simulateCloth, cloneCloth } from "./physics/cloth/cloth-sim";
export type { ClothMesh, ClothParticle, ClothConstraint, ClothStepOptions } from "./physics/cloth/cloth-sim";
export { generateSkinResiduals, applySkinResidualColor } from "./surface/skin/neural-skin";
export type { SkinResidualField, SkinResidualSample, SkinResidualOptions } from "./surface/skin/neural-skin";
export { projectTattooDecal, projectTattooDecals } from "./surface/tattoo/tattoo-decal";
export type { TattooDecal, TattooDecalSample, TattooDecalOptions } from "./surface/tattoo/tattoo-decal";
export { validatePerceptualHuman } from "./validation/perceptual-validator";
export type { PerceptualIssue, PerceptualIssueKind, PerceptualValidationReport } from "./validation/perceptual-validator";

// LOD
export { SemanticLOD, PerceptualLOD, QUALITY_LEVELS } from "./lod";
export type { SubsystemQuality, PerceptualScore } from "./lod";

// AI
export { DeterministicPromptInterpreter, intentToEvent } from "./ai/prompt/interpreter";
export type { PromptInterpreter, Intent, IntentType } from "./ai/prompt/interpreter";

// Formats
export { serializeDefinition, deserializeDocument, PACKAGE_MAGIC } from "./formats/human/human-package";
export type { HumanPackageHeader } from "./formats/human/human-package";

// Capability matrix (informational).
export const CAPABILITY_MATRIX = {
  schemaCompiler: "IMPLEMENTED",
  propertyIds: "IMPLEMENTED",
  gpuParameterBuffer: "IMPLEMENTED",
  dependencyGraph: "IMPLEMENTED",
  deltaCompiler: "IMPLEMENTED",
  sparseMorph: "IMPLEMENTED",
  identitySolver: "IMPLEMENTED",
  constraintSolver: "IMPLEMENTED",
  canonicalHuman: "PROTOTYPE",
  canonicalParts: "IMPLEMENTED",
  skeleton: "IMPLEMENTED",
  parametricAnatomy: "IMPLEMENTED",
  skeletalAnimation: "IMPLEMENTED",
  motionCompiler: "PROTOTYPE",
  gpuSkinning: "IMPLEMENTED",
  attachmentCoordinates: "IMPLEMENTED",
  tattooDecals: "PROTOTYPE",
  facialExpression: "IMPLEMENTED",
  speechVisemes: "IMPLEMENTED",
  timelineEventSourcing: "IMPLEMENTED",
  undoRedo: "IMPLEMENTED",
  gpuScheduler: "IMPLEMENTED",
  gpuMorphCompute: "IMPLEMENTED",
  semanticLod: "IMPLEMENTED",
  perceptualLod: "PROTOTYPE",
  perceptualValidation: "PROTOTYPE",
  gpuRenderer: "IMPLEMENTED",
  webglFallback: "IMPLEMENTED",
  strandHair: "PROTOTYPE",
  clothPhysics: "PROTOTYPE",
  sdfCollision: "PROTOTYPE",
  neuralSkin: "PROTOTYPE",
} as const;

export type Capability = keyof typeof CAPABILITY_MATRIX;

export const VERSION = "0.4.0";
