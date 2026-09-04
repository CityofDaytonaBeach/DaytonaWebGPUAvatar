// Daytona WebGPU Avatar â€” public SDK surface.
export { Human } from './human.js';
// Core
export { HumanDefinition } from './core/schema/human-definition.js';
export { PropertyRegistry, makePropertyId, propertyCategory, alignUp, } from './core/schema/registry.js';
export { DEFAULT_PROPERTY_DESCRIPTORS, createDefaultRegistry } from './core/schema/descriptors.js';
export { generateHumanParamsWgsl, validateWgslLayout, wgslFieldName, wgslLayoutFields, } from './core/schema/gpu-layout.js';
export { generateHumanDefinitionJsonSchema, validateHumanDefinitionRecord, } from './core/schema/json-schema.js';
export { PROPERTY_CATEGORIES, } from './core/schema/property.js';
// Events & timeline
export { createEvent, applyEventToDefinition } from './core/events/character-event.js';
export { CharacterTimeline } from './core/timeline/character-timeline.js';
export { createParameterTransition, sampleTransition, transitionComplete, TransitionTimeline, replayTransition, verifyTransitionDeterminism, validateTransitionDeterminism, verifyLongReplay, scrubTransition, scrubTimeline, } from './core/transitions/parameter-transition.js';
// Constraints
export { ConstraintSolver, CONSTRAINT_PROFILES } from './core/constraints/solver.js';
// Math
export { vec3, IDENTITY_QUAT, identityMatrix, multiplyMatrices } from './core/math/vec.js';
export { DependencyGraph } from './compiler/dependency/dependency-graph.js';
export { affectedSystemsForChange, systemForCategory, } from './compiler/dependency/affected-systems.js';
export { DeltaCompiler, CATEGORY_TO_KERNEL } from './compiler/delta/delta-compiler.js';
export { DirtyRegionTracker } from './compiler/delta/dirty-regions.js';
export { ComputeGraph } from './compiler/compute/compute-graph.js';
// Anatomy
export { defaultSkeleton, placeSkeletonFromDefinition } from './anatomy/skeleton/skeleton.js';
// Phase C — skeleton + rig adaptation to the shape space.
export { adaptSkeletonToPositions, boneWorldPositions, regionVertexIds, rotateVec3, skeletonAdaptationReportLines, JOINT_ANCHORS, SYMMETRIC_BONE_PAIRS, } from './anatomy/skeleton/skeleton-adaptation.js';
export { buildBoneSegments, distanceToSegment, solveSkinWeights, applySkinWeights, validateSkinWeights, REGION_BONE_PRIOR, } from './anatomy/skeleton/skin-weight-solver.js';
export { RigAdapter, deformedPositions, bindPoseError } from './anatomy/skeleton/rig-adaptation.js';
export { resolveAnatomy, validateAnatomy, anatomySatisfaction, } from './anatomy/parametric/parametric-anatomy.js';
export { buildBoneMatrices, combinedSkinMatrices, composeMatrix, invertMatrix, } from './anatomy/skeleton/bone-matrix.js';
export { buildInfluences, skinMeshCPU, skinNormalsCPU, normalizeWeights, MAX_INFLUENCES, } from './gpu/kernels/skin-mesh.js';
export { buildInternalAnatomyView, buildOrganSystemView, buildRenderData, estimatePrimitiveVolume, estimateAllVolumes, totalVolume, buildJointVisualizations, visualizeFracture, applyMuscleActivation, applyHeatmapOverlay, buildAnatomyRenderPipeline, } from './anatomy/internal/internal-anatomy.js';
// Identity
export { IdentitySolver } from './identity/solver/identity-solver.js';
// Shape space
export { ShapeBasisRegistry, sparseDelta } from './anatomy/shape-space/shape-basis.js';
export { HumanShapeSpace } from './anatomy/shape-space/human-shape-space.js';
export { ShapeCoefficientSolver } from './anatomy/shape-space/shape-coefficient-solver.js';
export { CorrectiveShapeSolver } from './anatomy/shape-space/shape-corrective-solver.js';
// Geometry
export { CanonicalHuman, generateBlockHuman } from './geometry/canonical/canonical-human.js';
export { REQUIRED_CANONICAL_PARTS, REQUIRED_CANONICAL_REGIONS, validateCanonicalHuman, validateCanonicalTopology, } from './geometry/canonical/canonical-validator.js';
export { adaptCanonicalTopologyAsset, CanonicalTopologyAdapter, } from './geometry/canonical/canonical-adapter.js';
export { DebugBlockHumanProvider, CanonicalHumanProviderRegistry, topologyFromHuman, DEFAULT_PROVIDER_BONE_NAMES, } from './geometry/canonical/canonical-provider.js';
export { HDCanonicalHumanProvider } from './geometry/canonical/hd-head-provider.js';
export { HD_HEAD_REGIONS, HD_HEAD_PART_REGIONS, HD_BODY_REGIONS, EYELID_REGIONS, REQUIRED_HD_HEAD_REGIONS, } from './geometry/canonical/regions.js';
export { resolveLandmarkPosition, findTriangleInRegion } from './geometry/canonical/landmark.js';
export { SparseMorphSet } from './geometry/morph/sparse-morph.js';
export { MorphDriver } from './geometry/morph/morph-driver.js';
// GPU
export { createDeviceAndProfile } from './gpu/device/capabilities.js';
export { CharacterGpuState } from './gpu/buffers/character-gpu-state.js';
export { MorphKernel } from './gpu/kernels/morph-kernel.js';
export { GpuMorphDeform } from './gpu/kernels/gpu-morph-deform.js';
export { packSparseMorphs, setMorphWeights } from './gpu/morph/gpu-morph-buffers.js';
export { HumanProfiler, countDirtyVertices } from './gpu/profiler/profiler.js';
export { GpuScheduler } from './gpu/scheduler/gpu-scheduler.js';
// Render
export { placeholderShaders, HUMAN_PARAM_STRUCT, buildShaderModule, } from './render/wgsl/shaders.js';
export { WebGPURenderer, HUMAN_RENDER_WGSL, buildCameraMatrices, } from './render/webgpu/renderer.js';
export { WebGpuHumanPipeline } from './render/webgpu/pipeline.js';
export { WebGL2HumanRenderer, buildWebGL2RenderParts, webglPartColor, } from './render/webgl2/renderer.js';
export { MORPH_COMPUTE_WGSL } from './render/wgsl/morph-wgsl.js';
// Animation
export { SkeletalAnimation, sampleChannel, quatFromEulerDeg as quatFromEuler, } from './animation/skeleton/skeletal-animation.js';
export { MotionCompiler, compileMotionCommand, solveIK2Bone, solveLookAt, compileLookAt, compileIKArm, compileIKLeg, compileWalk, blendMotions, transitionTo, retargetPoses, validateMotion, } from './animation/motion/motion-compiler.js';
// Kinematics / IK / retargeting
export { forwardKinematics, boneWorldPosition, topologicalBoneOrder, resolveBoneChain, quatToEulerDeg, eulerDegToQuat, } from './animation/skeleton/kinematics.js';
export { solveChainIK, solveLimbIK } from './animation/ik/ik-solver.js';
export { solveLookAtChain, measureGazeError, worldPointFromBone } from './animation/ik/look-at.js';
export { buildRetargetMap, retargetPose, retargetClip, retargetFidelity, skeletonHeight, retargetedPoseMap, } from './animation/retarget/retargeting.js';
export { FacialExpressionSystem } from './animation/facial/facial-expression.js';
export { SpeechSolver, simpleTTS } from './animation/speech/speech-solver.js';
// Attachments
export { AttachmentSystem } from './attachments/attachment-system.js';
// Surface
export { generateStrandHair, countHairVertices, clumpStrands, taperStrandThickness, applyHairWind, reduceStrandsForLOD, buildHairMesh, strandColors, HairSim, HAIR_LOD_BUDGETS, } from './surface/hair/strand-hair.js';
export { HumanSdfField, buildHumanSdfField, SDF_LOW_LOD, SDF_MEDIUM_LOD, SDF_HIGH_LOD, SDF_ULTRA_LOD, defaultSdfCollisionConfig, capsuleCapsuleDistance, capsulePointClosest, segmentSegmentClosest, sphereSphereDistance, capsuleBoxDistance, } from './physics/sdf/human-sdf.js';
export { createTorsoCloth, stepCloth, simulateCloth, cloneCloth, stepClothAdvanced, simulateClothAdvanced, seedTurbulence, clothToGPUBuffer, clothConstraintsToGPUBuffer, clothRestLengthsToGPUBuffer, meshToGPULayout, meshFromGPULayout, } from './physics/cloth/cloth-sim.js';
export { generateSkinResiduals, applySkinResidualColor, exportSkinMaterial, generateNormalPerturbation, computeSSSApproximation, generateWrinkleMap, generatePoreDetail, computeAgingState, generateBlemishes, getRegionSkinMaterial, getSkinPresetProfile, SKIN_PRESETS, REGION_MATERIALS, } from './surface/skin/neural-skin.js';
export { projectTattooDecal, projectTattooDecals, projectUVDecal, projectTattooDecalExtended, applyOpacityMap, generateDecalNormalOverlay, accumulateNormalOverlays, bakeDecalVertexColors, bakeDecalToNewBuffer, blendMultipleDecals, reprojectDecalWithMorph, reprojectDecalsWithMorph, exportGPUData, exportVertexColorBuffer, exportNormalOverlayBuffer, TattooDecalSystem, } from './surface/tattoo/tattoo-decal.js';
export { generateGarment, generateGarments, toRenderMesh, toPhysicsMesh, simulateClothStep, applyDrape, generateWrinkles, applyWrinkles, generateGarmentLODs, selectLOD, } from './surface/clothing/garment.js';
export { validatePerceptualHuman, CorrectiveBatch, ValidationCache, PerceptualValidator, NEUTRAL_ARM_SPAN_RATIO, } from './validation/perceptual-validator.js';
// LOD
export { SemanticLOD, PerceptualLOD, QUALITY_LEVELS, LOD_PRESETS, LOD_SUBSYSTEMS, perceptualWeight, QUALITY_COST, LODTransitionManager, BudgetAllocator, snapLevel, budgetForDistance, } from './lod/index.js';
// AI
export { DeterministicPromptInterpreter, intentToEvent } from './ai/prompt/interpreter.js';
// Formats
export { serializeDefinition, deserializeDocument, createHumanPackageDocument, migrateHumanPackageDocument, PACKAGE_MAGIC, PACKAGE_VERSION, DEFAULT_TOPOLOGY_REF, DEFAULT_SCHEMA_VERSION, DEFAULT_PACKAGE_MIGRATIONS, } from './formats/human/human-package.js';
// Production diagnostics / benchmarks
export { DEFAULT_LOCALIZED_EDIT_BENCHMARKS, runLocalizedEditBenchmark, runLocalizedEditGpuTimestampBenchmark, BenchmarkSuite, detectGpuFeatureStatus, detectRegressions, toJUnitXml, toJsonSummary, toMarkdownTable, exportBenchmarkResult, } from './testing/performance/localized-edit-benchmark.js';
// Roadmap / production tracking
export { START_MD_PHASES, PHASE_STATUSES, phaseReport } from './roadmap/phase-report.js';
// Capability matrix (single source of truth; shared with the phase report so no
// two places can disagree about what is actually implemented).
export { CAPABILITY_STATUSES, CAPABILITY_MATRIX, capabilityReport, capabilityStatus, } from './roadmap/capability-matrix.js';
// Motion runtime — puts the motion compiler inside the animation frame loop.
export { MotionRuntime, DEFAULT_MOTION_RUNTIME_CONFIG, blendPoses, withPhase, } from './animation/motion/motion-runtime.js';
// GPU validation harness — buffer/dispatch bounds plus live error-scope capture.
export { GpuValidationHarness, DEFAULT_GPU_LIMITS, resolveLimits, validateDispatch, validateBufferBinding, validateComputeResources, validatePackedMorphBounds, } from './gpu/device/gpu-validation-harness.js';
// Parameter transitions validated through the real GPU morph path.
export { validateTransitionThroughGpuPath, runTransitionGpuValidationSuite, DEFAULT_TRANSITION_GPU_CASES, } from './gpu/morph/transition-gpu-validation.js';
// CI-enforced performance budgets on top of the benchmark suite.
export { evaluateBenchmarkGates, baselineFromSummary, formatGateResult, DEFAULT_BENCHMARK_BUDGETS, DEFAULT_BENCHMARK_GATE_CONFIG, } from './testing/performance/benchmark-gates.js';
export const VERSION = '1.0.0';
//# sourceMappingURL=index.js.map