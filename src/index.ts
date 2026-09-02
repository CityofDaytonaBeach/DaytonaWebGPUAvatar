// Daytona WebGPU Avatar — public SDK surface.

export { Human } from './human';
export type { HumanCreateOptions, HumanModifyResult } from './human';

// Core
export { HumanDefinition } from './core/schema/human-definition';
export {
  PropertyRegistry,
  makePropertyId,
  propertyCategory,
  alignUp,
} from './core/schema/registry';
export type { PropertyDescriptor } from './core/schema/registry';
export { DEFAULT_PROPERTY_DESCRIPTORS, createDefaultRegistry } from './core/schema/descriptors';
export {
  generateHumanParamsWgsl,
  validateWgslLayout,
  wgslFieldName,
  wgslLayoutFields,
} from './core/schema/gpu-layout';
export type {
  WgslLayoutField,
  WgslLayoutValidationIssue,
  WgslLayoutValidationResult,
} from './core/schema/gpu-layout';
export {
  generateHumanDefinitionJsonSchema,
  validateHumanDefinitionRecord,
} from './core/schema/json-schema';
export type {
  HumanDefinitionJsonSchema,
  JsonSchemaProperty,
  SchemaValidationIssue,
  SchemaValidationResult,
} from './core/schema/json-schema';
export {
  PropertyCategory,
  PersistenceType,
  IdentityImportance,
  PROPERTY_CATEGORIES,
} from './core/schema/property';
export type { PropertyMeta, PropertyType } from './core/schema/property';

// Events & timeline
export { createEvent, applyEventToDefinition } from './core/events/character-event';
export type {
  CharacterEvent,
  CharacterEventType,
  EventSource,
} from './core/events/character-event';
export { CharacterTimeline } from './core/timeline/character-timeline';
export type { Snapshot } from './core/timeline/character-timeline';
export {
  createParameterTransition,
  sampleTransition,
  transitionComplete,
  TransitionTimeline,
  replayTransition,
  verifyTransitionDeterminism,
  validateTransitionDeterminism,
} from './core/transitions/parameter-transition';
export type {
  ParameterTransition,
  TransitionCurve,
  TransitionSpec,
  EaseVariant,
  OvershootConfig,
  TransitionSummary,
  TransitionBenchmark,
} from './core/transitions/parameter-transition';

// Constraints
export { ConstraintSolver, CONSTRAINT_PROFILES } from './core/constraints/solver';
export type { ConstraintProfile, ConstraintResult } from './core/constraints/types';

// Math
export { vec3, IDENTITY_QUAT, identityMatrix, multiplyMatrices } from './core/math/vec';
export type { Vec3, Vec4, Quat } from './core/math/vec';
export { DependencyGraph } from './compiler/dependency/dependency-graph';
export type { DependencyNode } from './compiler/dependency/dependency-graph';
export {
  affectedSystemsForChange,
  systemForCategory,
} from './compiler/dependency/affected-systems';
export type { AffectedSystem, AffectedSystemName } from './compiler/dependency/affected-systems';
export { DeltaCompiler, CATEGORY_TO_KERNEL } from './compiler/delta/delta-compiler';
export type {
  DeltaVertexRangeSource,
  KernelWork,
  KernelKind,
} from './compiler/delta/delta-compiler';
export { DirtyRegionTracker } from './compiler/delta/dirty-regions';
export { ComputeGraph } from './compiler/compute/compute-graph';
export type { GraphNode } from './compiler/compute/compute-graph';

// Anatomy
export { defaultSkeleton, placeSkeletonFromDefinition } from './anatomy/skeleton/skeleton';
export type { BoneDef, BoneName, JointLimits } from './anatomy/skeleton/skeleton';
export {
  resolveAnatomy,
  validateAnatomy,
  anatomySatisfaction,
} from './anatomy/parametric/parametric-anatomy';
export type { AnatomyDimensions, AnatomyConstraint } from './anatomy/parametric/parametric-anatomy';
export {
  buildBoneMatrices,
  combinedSkinMatrices,
  composeMatrix,
  invertMatrix,
} from './anatomy/skeleton/bone-matrix';
export {
  buildInfluences,
  skinMeshCPU,
  skinNormalsCPU,
  normalizeWeights,
  MAX_INFLUENCES,
} from './gpu/kernels/skin-mesh';
export type { SkinInfluences } from './gpu/kernels/skin-mesh';
export {
  buildInternalAnatomyView,
  buildOrganSystemView,
  buildRenderData,
  estimatePrimitiveVolume,
  estimateAllVolumes,
  totalVolume,
  buildJointVisualizations,
  visualizeFracture,
  applyMuscleActivation,
  applyHeatmapOverlay,
  buildAnatomyRenderPipeline,
} from './anatomy/internal/internal-anatomy';
export type {
  InternalAnatomyMode,
  InternalAnatomyPrimitive,
  InternalAnatomyPrimitiveKind,
  InternalAnatomyView,
  OrganSystemMode,
  InternalAnatomyRenderData,
  PrimitiveVolume,
  JointVisualization,
  JointMarkerShape,
  BoneFracture,
  FractureVisualization,
  MuscleActivation,
  HeatmapOverlay,
  HeatmapSample,
} from './anatomy/internal/internal-anatomy';

// Identity
export { IdentitySolver } from './identity/solver/identity-solver';
export type { IdentityBudget, IdentityChangeGate } from './identity/solver/identity-solver';

// Geometry
export { CanonicalHuman, generateBlockHuman } from './geometry/canonical/canonical-human';
export type {
  RegionName,
  Vertex,
  MorphDelta,
  SparseMorph,
  PartGeometry,
  PartKind,
} from './geometry/canonical/canonical-human';
export {
  REQUIRED_CANONICAL_PARTS,
  REQUIRED_CANONICAL_REGIONS,
  validateCanonicalHuman,
  validateCanonicalTopology,
} from './geometry/canonical/canonical-validator';
export type {
  CanonicalValidationIssue,
  CanonicalValidationReport,
} from './geometry/canonical/canonical-validator';
export type {
  CanonicalTopology,
  CanonicalTopologyPart,
  CanonicalTopologyVertex,
} from './geometry/canonical/canonical-topology';
export {
  adaptCanonicalTopologyAsset,
  CanonicalTopologyAdapter,
} from './geometry/canonical/canonical-adapter';
export type {
  CanonicalAdapterResult,
  CanonicalAssetAdapter,
} from './geometry/canonical/canonical-adapter';
export { SparseMorphSet } from './geometry/morph/sparse-morph';
export { MorphDriver } from './geometry/morph/morph-driver';

// GPU
export { createDeviceAndProfile } from './gpu/device/capabilities';
export type { DeviceCapabilities, DeviceProfile } from './gpu/device/capabilities';
export { CharacterGpuState } from './gpu/buffers/character-gpu-state';
export { MorphKernel } from './gpu/kernels/morph-kernel';
export { GpuMorphDeform } from './gpu/kernels/gpu-morph-deform';
export { packSparseMorphs, setMorphWeights } from './gpu/morph/gpu-morph-buffers';
export type { PackedMorphBuffers, GpuMorphLayout } from './gpu/morph/gpu-morph-buffers';
export { HumanProfiler, countDirtyVertices } from './gpu/profiler/profiler';
export type { FrameMetrics } from './gpu/profiler/profiler';
export { GpuScheduler } from './gpu/scheduler/gpu-scheduler';
export type {
  ScheduleDecision,
  ScheduleItem,
  SchedulerConfig,
  SchedulerStats,
  SchedulerReport,
  SchedulerProfile,
  PriorityQueue,
} from './gpu/scheduler/gpu-scheduler';

// Render
export { placeholderShaders, HUMAN_PARAM_STRUCT, buildShaderModule } from './render/wgsl/shaders';
export type { HumanRendererShaders } from './render/wgsl/shaders';
export { WebGPURenderer, HUMAN_RENDER_WGSL, buildCameraMatrices } from './render/webgpu/renderer';
export type { CameraMatrices, RenderPart } from './render/webgpu/renderer';
export { WebGpuHumanPipeline } from './render/webgpu/pipeline';
export type { WebGpuHumanPipelineOptions } from './render/webgpu/pipeline';
export {
  WebGL2HumanRenderer,
  buildWebGL2RenderParts,
  webglPartColor,
} from './render/webgl2/renderer';
export type { WebGL2RenderPart } from './render/webgl2/renderer';
export { MORPH_COMPUTE_WGSL } from './render/wgsl/morph-wgsl';

// Animation
export {
  SkeletalAnimation,
  sampleChannel,
  quatFromEulerDeg as quatFromEuler,
} from './animation/skeleton/skeletal-animation';
export type { BonePose, AnimationChannel } from './animation/skeleton/skeletal-animation';
export {
  MotionCompiler,
  compileMotionCommand,
  solveIK2Bone,
  solveLookAt,
  compileLookAt,
  compileIKArm,
  compileIKLeg,
  compileWalk,
  blendMotions,
  transitionTo,
  retargetPoses,
  validateMotion,
} from './animation/motion/motion-compiler';
export type {
  MotionKind,
  MotionPlan,
  MotionCompilerConfig,
  IKChain,
  GestureName,
} from './animation/motion/motion-compiler';
export { FacialExpressionSystem } from './animation/facial/facial-expression';
export type { SemanticExpression } from './animation/facial/facial-expression';
export { SpeechSolver, simpleTTS } from './animation/speech/speech-solver';
export type { SpeechTrack, Phoneme, Viseme } from './animation/speech/speech-solver';

// Attachments
export { AttachmentSystem } from './attachments/attachment-system';
export type {
  HumanAttachment,
  AttachmentAnchor,
  AttachmentKind,
} from './attachments/attachment-system';

// Surface
export {
  generateStrandHair,
  countHairVertices,
  clumpStrands,
  taperStrandThickness,
  applyHairWind,
  reduceStrandsForLOD,
  buildHairMesh,
  strandColors,
  HairSim,
  HAIR_LOD_BUDGETS,
} from './surface/hair/strand-hair';
export type {
  StrandHairGeometry,
  HairStrand,
  HairStrandPoint,
  StrandHairOptions,
  HairClump,
  ClumpOptions,
  ThicknessTaper,
  TaperOptions,
  WindField,
  WindOptions,
  HairLodLevel,
  LodOptions,
  HairColorOption,
  StrandColorMap,
  HairCard,
  HairCardVertex,
  HairRenderMesh,
  HairMeshOptions,
  HairSimulationOptions,
} from './surface/hair/strand-hair';
export {
  HumanSdfField,
  buildHumanSdfField,
  SDF_LOW_LOD,
  SDF_MEDIUM_LOD,
  SDF_HIGH_LOD,
  SDF_ULTRA_LOD,
  defaultSdfCollisionConfig,
  capsuleCapsuleDistance,
  capsulePointClosest,
  segmentSegmentClosest,
  sphereSphereDistance,
  capsuleBoxDistance,
} from './physics/sdf/human-sdf';
export type {
  HumanSdfPrimitive,
  HumanSdfPrimitiveKind,
  HumanSdfSample,
  SdfLodLevel,
  SdfLodProfile,
  ExternalCollisionInputs,
  CollisionPrimitive,
  HumanSdfNearestSample,
  HumanSdfPredictResult,
  SdfCollisionConfig,
} from './physics/sdf/human-sdf';
export {
  createTorsoCloth,
  stepCloth,
  simulateCloth,
  cloneCloth,
  stepClothAdvanced,
  simulateClothAdvanced,
  seedTurbulence,
  clothToGPUBuffer,
  clothConstraintsToGPUBuffer,
  clothRestLengthsToGPUBuffer,
  meshToGPULayout,
  meshFromGPULayout,
} from './physics/cloth/cloth-sim';
export type {
  ClothMesh,
  ClothParticle,
  ClothConstraint,
  ClothStepOptions,
  ClothWindConfig,
  ClothSimConfig,
} from './physics/cloth/cloth-sim';
export {
  generateSkinResiduals,
  applySkinResidualColor,
  exportSkinMaterial,
  computeSSSApproximation,
  generateWrinkleMap,
  generatePoreDetail,
  computeAgingState,
  generateBlemishes,
  getRegionSkinMaterial,
  getSkinPresetProfile,
  SKIN_PRESETS,
  REGION_MATERIALS,
} from './surface/skin/neural-skin';
export type {
  SkinResidualField,
  SkinResidualSample,
  SkinResidualOptions,
  SkinMaterialExport,
  SkinPreset,
  SkinPresetProfile,
  RegionSkinMaterial,
  WrinkleMap,
  WrinkleOptions,
  BlemishDescriptor,
  BlemishOptions,
  AgingState,
  PoreDetail,
  PoreOptions,
} from './surface/skin/neural-skin';
export {
  projectTattooDecal,
  projectTattooDecals,
  projectUVDecal,
  projectTattooDecalExtended,
  applyOpacityMap,
  generateDecalNormalOverlay,
  accumulateNormalOverlays,
  bakeDecalVertexColors,
  bakeDecalToNewBuffer,
  blendMultipleDecals,
  reprojectDecalWithMorph,
  reprojectDecalsWithMorph,
  exportGPUData,
  exportVertexColorBuffer,
  exportNormalOverlayBuffer,
  TattooDecalSystem,
} from './surface/tattoo/tattoo-decal';
export type {
  TattooDecal,
  TattooDecalSample,
  TattooDecalOptions,
  TattooBlendMode,
  TattooFalloffCurve,
  TattooDecalSampleExtended,
  TattooDecalExtended,
  TattooOpacityMap,
  TattooBakedVertexColors,
  TattooBakedNormalOverlay,
  TattooGPUExport,
} from './surface/tattoo/tattoo-decal';
export {
  generateGarment,
  generateGarments,
  toRenderMesh,
  toPhysicsMesh,
  simulateClothStep,
  applyDrape,
  generateWrinkles,
  applyWrinkles,
  generateGarmentLODs,
  selectLOD,
} from './surface/clothing/garment';
export type {
  GarmentKind,
  GarmentMesh,
  GarmentOptions,
  GarmentVertex,
  GarmentRenderMesh,
  GarmentPhysicsMesh,
  GarmentLODMesh,
  GarmentLODLevel,
} from './surface/clothing/garment';
export {
  validatePerceptualHuman,
  CorrectiveBatch,
  ValidationCache,
  PerceptualValidator,
  NEUTRAL_ARM_SPAN_RATIO,
} from './validation/perceptual-validator';
export type {
  PerceptualIssue,
  PerceptualIssueKind,
  PerceptualValidationReport,
  PerceptualValidationReportJSON,
  PerceptualValidatorConfig,
  ValidationSeverity,
  PerceptualRenderedFrame,
  VisualEvaluationHook,
} from './validation/perceptual-validator';

// LOD
export {
  SemanticLOD,
  PerceptualLOD,
  QUALITY_LEVELS,
  LOD_PRESETS,
  LOD_SUBSYSTEMS,
  perceptualWeight,
  QUALITY_COST,
  LODTransitionManager,
  BudgetAllocator,
  snapLevel,
  budgetForDistance,
} from './lod';
export type {
  SubsystemQuality,
  PerceptualScore,
  LODPresetName,
  LODPreset,
  BudgetAllocatorConfig,
  LODStats,
  LODReport,
} from './lod';

// AI
export { DeterministicPromptInterpreter, intentToEvent } from './ai/prompt/interpreter';
export type { PromptInterpreter, Intent, IntentType } from './ai/prompt/interpreter';

// Formats
export {
  serializeDefinition,
  deserializeDocument,
  createHumanPackageDocument,
  migrateHumanPackageDocument,
  PACKAGE_MAGIC,
  PACKAGE_VERSION,
  DEFAULT_TOPOLOGY_REF,
  DEFAULT_SCHEMA_VERSION,
  DEFAULT_PACKAGE_MIGRATIONS,
} from './formats/human/human-package';
export type {
  HumanPackageDocument,
  HumanPackageHeader,
  HumanPackageMigration,
} from './formats/human/human-package';

// Production diagnostics / benchmarks
export {
  DEFAULT_LOCALIZED_EDIT_BENCHMARKS,
  runLocalizedEditBenchmark,
  runLocalizedEditGpuTimestampBenchmark,
  BenchmarkSuite,
  detectGpuFeatureStatus,
  detectRegressions,
  toJUnitXml,
  toJsonSummary,
  toMarkdownTable,
  exportBenchmarkResult,
} from './testing/performance/localized-edit-benchmark';
export type {
  GpuTimestampBenchmarkOptions,
  GpuTimestampBenchmarkResult,
  LocalizedEditBenchmarkCase,
  LocalizedEditBenchmarkResult,
  LocalizedEditBenchmarkSummary,
  BenchmarkConfig,
  StatisticalSummary,
  BenchmarkRunSummary,
  GpuFeatureStatus,
  RegressionBaseline,
  BenchmarkRegressionReport,
} from './testing/performance/localized-edit-benchmark';

// Roadmap / production tracking
export { START_MD_PHASES, PHASE_STATUSES, phaseReport } from './roadmap/phase-report';
export type { PhaseMilestone, PhaseReport, PhaseStatus } from './roadmap/phase-report';

export const CAPABILITY_STATUSES = ['IMPLEMENTED', 'PARTIAL', 'PROTOTYPE', 'PLANNED'] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

// Capability matrix (queryable; do not claim prototype systems as implemented).
export const CAPABILITY_MATRIX = {
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
  canonicalHuman: 'IMPLEMENTED',
  canonicalValidation: 'IMPLEMENTED',
  canonicalAssetAdapter: 'IMPLEMENTED',
  canonicalParts: 'IMPLEMENTED',
  skeleton: 'IMPLEMENTED',
  parametricAnatomy: 'IMPLEMENTED',
  internalAnatomyModes: 'IMPLEMENTED',
  skeletalAnimation: 'IMPLEMENTED',
  motionCompiler: 'IMPLEMENTED',
  gpuSkinning: 'IMPLEMENTED',
  attachmentCoordinates: 'IMPLEMENTED',
  tattooDecals: 'IMPLEMENTED',
  clothingGeometry: 'IMPLEMENTED',
  facialExpression: 'IMPLEMENTED',
  speechVisemes: 'IMPLEMENTED',
  timelineEventSourcing: 'IMPLEMENTED',
  timelineDirtyReporting: 'IMPLEMENTED',
  nonPropertyEventDirtyReporting: 'IMPLEMENTED',
  parameterTransitions: 'IMPLEMENTED',
  snapshotRestore: 'IMPLEMENTED',
  undoRedo: 'IMPLEMENTED',
  gpuScheduler: 'IMPLEMENTED',
  gpuMorphCompute: 'IMPLEMENTED',
  localizedEditBenchmark: 'IMPLEMENTED',
  gpuTimestampBenchmark: 'IMPLEMENTED',
  semanticLod: 'IMPLEMENTED',
  perceptualLod: 'IMPLEMENTED',
  perceptualValidation: 'IMPLEMENTED',
  gpuRenderer: 'IMPLEMENTED',
  webglFallback: 'IMPLEMENTED',
  strandHair: 'IMPLEMENTED',
  clothPhysics: 'IMPLEMENTED',
  sdfCollision: 'IMPLEMENTED',
  neuralSkin: 'IMPLEMENTED',
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

export const VERSION = '1.0.0';
