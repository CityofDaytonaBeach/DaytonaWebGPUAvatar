import { type Capability, type CapabilityStatus } from '../roadmap/capability-matrix.js';
/**
 * The "Daytona Kiosk Ready" gate.
 *
 * The full roadmap (photoreal humans, cloth, photo reconstruction) is far larger
 * than what a talking information kiosk needs. This module encodes the narrower,
 * shippable contract: exactly the capabilities required to put the avatar in
 * front of the public, so readiness is a computed fact rather than an opinion.
 */
export declare const KIOSK_REQUIRED_CAPABILITIES: readonly ["schemaCompiler", "identitySolver", "constraintSolver", "canonicalHuman", "canonicalValidation", "skeleton", "skeletalAnimation", "motionCompiler", "motionRuntime", "gpuSkinning", "facialExpression", "speechVisemes", "parameterTransitions", "transitionGpuValidation", "timelineEventSourcing", "gpuMorphCompute", "gpuValidationHarness", "benchmarkGates", "gpuRenderer", "webglFallback", "photorealSkinShading", "photorealEyeShading", "photorealMaterials", "imageBasedLighting", "screenSpaceSss", "kioskBlinkQuality", "kioskGazeBehavior", "kioskIdleMotion", "kioskInterruption", "kioskSoakValidation", "webgpuDeviceRecovery"];
export interface KioskReadinessEntry {
    capability: Capability;
    status: CapabilityStatus;
    ready: boolean;
}
export interface KioskReadinessReport {
    ready: boolean;
    required: number;
    satisfied: number;
    blocking: KioskReadinessEntry[];
    entries: KioskReadinessEntry[];
    /** Capabilities explicitly out of scope for the kiosk gate. */
    deferred: readonly string[];
}
export declare const KIOSK_DEFERRED: readonly ["photo-to-human reconstruction", "advanced aging", "crowd rendering", "gaussian splatting", "WebNN neural rendering", "strand hair production quality", "cloth physics production quality", "clothing geometry production quality", "internal organ detail", "new AI agent architecture"];
export declare function kioskReadinessReport(): KioskReadinessReport;
//# sourceMappingURL=kiosk-ready.d.ts.map