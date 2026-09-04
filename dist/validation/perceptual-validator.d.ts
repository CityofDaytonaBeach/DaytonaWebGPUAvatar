import { AnatomyDimensions } from '../anatomy/parametric/parametric-anatomy.js';
import { CharacterEvent } from '../core/events/character-event.js';
import { HumanDefinition } from '../core/schema/human-definition.js';
import { CanonicalHuman } from '../geometry/canonical/canonical-human.js';
export type PerceptualIssueKind = 'anatomy.proportion' | 'eye.alignment' | 'mouth.intersection' | 'expression.range' | 'skin.tone' | 'proportion.ratio' | 'symmetry';
export type ValidationSeverity = 'info' | 'warning' | 'error';
export interface PerceptualIssue {
    kind: PerceptualIssueKind;
    severity: ValidationSeverity;
    message: string;
    score: number;
    correctiveRequest?: CharacterEvent;
}
export interface PerceptualValidationReport {
    score: number;
    issues: PerceptualIssue[];
    correctiveRequests: CharacterEvent[];
    /** Counts of issues per severity level. */
    severityCounts: Record<ValidationSeverity, number>;
    /** Stable JSON-serializable snapshot of the report. */
    json: PerceptualValidationReportJSON;
}
/** JSON-serializable report shape (no functions / no CharacterEvent refs). */
export interface PerceptualValidationReportJSON {
    score: number;
    issues: Array<{
        kind: PerceptualIssueKind;
        severity: ValidationSeverity;
        message: string;
        score: number;
    }>;
    severityCounts: Record<ValidationSeverity, number>;
}
/** Tuning thresholds for perceptual validation checks. */
export interface PerceptualValidatorConfig {
    /** Minimum satisfaction before an anatomy constraint becomes an issue. */
    anatomySatisfactionThreshold: number;
    /** Eye y-misalignment (in model units) tolerated before flagging. */
    eyeYErrorWarning: number;
    eyeYErrorError: number;
    minEyeSpacing: number;
    maxEyeSpacing: number;
    eyeSpacingErrorMin: number;
    eyeSpacingErrorMax: number;
    /** Skin tone checks. */
    skinLuminanceSpreadMax: number;
    /** Proportion ratio checks. */
    armSpanRatioTolerance: number;
    headHeightRatioMin: number;
    headHeightRatioMax: number;
    /** Symmetry checks. */
    symmetryOffsetTolerance: number;
    /** Cache: whether changed properties invalidate checks. */
    cacheEnabled: boolean;
}
/**
 * Structure-invariant arm-span-to-height ratio produced by the canonical
 * neutral limb lengths (upper=0.1h, forearm=0.085h, hand=0.05h each side).
 */
export declare const NEUTRAL_ARM_SPAN_RATIO = 0.47;
/**
 * Optional visual/perceptual validation prototype. It never mutates geometry;
 * it only emits structured corrective requests for the normal event pipeline.
 */
/**
 * Rendered-image evaluation hooks. When a renderer is attached, validation can
 * request and inspect a rendered frame for visual-only checks (tone gradients,
 * silhouette symmetry) that cannot be derived from raw geometry alone.
 */
export interface PerceptualRenderedFrame {
    /** Width in pixels of the rendered frame. */
    width: number;
    /** Height in pixels of the rendered frame. */
    height: number;
    /** Luminance per pixel, row-major. If missing, luminance is computed. */
    luminance?: Float32Array;
    /** Average skin-tone RGB channels per skin pixel cluster (0..1). */
    skinSamples?: Array<{
        r: number;
        g: number;
        b: number;
    }>;
}
/** Renderer-facing interface that produces frames for visual validation. */
export interface VisualEvaluationHook {
    id: string;
    /** Capture a low-resolution frame for validation purposes. */
    captureFrame: () => PerceptualRenderedFrame | null;
    /** True when a fresh frame is available to evaluate. */
    hasFreshFrame: () => boolean;
}
/**
 * Collects multiple corrective requests and applies them atomically â€” all-or-
 * nothing â€” so a character is never left in a half-corrected state.
 */
export declare class CorrectiveBatch {
    private requests;
    add(event: CharacterEvent): void;
    addAll(events: CharacterEvent[]): void;
    get size(): number;
    isEmpty(): boolean;
    /** All merged corrective requests (changed-property map deduplicated). */
    toEvents(): CharacterEvent[];
    clear(): void;
    /**
     * Deterministically merge all corrective "set" requests into a single
     * atomic event. Later requests win on property conflicts.
     */
    toAtomicEvent(source?: 'developer'): CharacterEvent | null;
}
/**
 * Cache for incremental validation: tracks which properties have changed since
 * the last validation so unchanged properties are not re-validated.
 */
export declare class ValidationCache {
    private fingerprint;
    private validKinds;
    /**
     * Snapshots the current definition values keyed by property path. Returns
     * true if anything changed relative to the last snapshot.
     */
    snapshotChanged(definition: HumanDefinition): boolean;
    /** Mark a particular check kind as already validated at this snapshot. */
    markValid(kind: PerceptualIssueKind): void;
    /** True if this check kind is already valid at the current snapshot. */
    isValid(kind: PerceptualIssueKind): boolean;
    /** Invalidate everything (called when the definition changes). */
    reset(): void;
    /** Deterministic representation for debugging. */
    toJSON(): unknown;
}
/**
 * Instances a reusable perceptual validator with configurable thresholds,
 * incremental caching, corrective batching, and rendered-frame evaluation.
 */
export declare class PerceptualValidator {
    readonly cache: ValidationCache;
    private config;
    private hooks;
    constructor(config?: Partial<PerceptualValidatorConfig>);
    getConfig(): PerceptualValidatorConfig;
    /** Attach a rendered-frame evaluation hook. */
    attachVisualHook(hook: VisualEvaluationHook): void;
    detachVisualHook(id: string): void;
    /** Batch + run a validator function; returns (issues, correctiveBatch). */
    private run;
    /** Aggregate severity threshold rules into a report. */
    validate(definition: HumanDefinition, canonical: CanonicalHuman, dims: AnatomyDimensions): PerceptualValidationReport;
    private anatomyOk;
    private validateAnatomy;
    private validateEye;
    private validateMouth;
    private validateExpression;
    private validateSkinTone;
    private validateProportionRatios;
    private validateSymmetry;
    private validateRender;
    /** Export the current report as a portable JSON object. */
    exportJSON(definition: HumanDefinition, canonical: CanonicalHuman, dims: AnatomyDimensions): PerceptualValidationReportJSON;
}
/**
 * Functional entry point kept for backward compatibility. Uses a fresh config
 * and cache each call so it remains deterministic and side-effect free.
 */
export declare function validatePerceptualHuman(definition: HumanDefinition, canonical: CanonicalHuman, dims: AnatomyDimensions): PerceptualValidationReport;
//# sourceMappingURL=perceptual-validator.d.ts.map