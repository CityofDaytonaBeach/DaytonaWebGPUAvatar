import { CanonicalHuman } from './canonical-human.js';
import { CanonicalTopology } from './canonical-topology.js';
import { HumanLandmark } from './landmark.js';
import { CanonicalValidationReport, CanonicalValidationIssue } from './canonical-validator.js';
/** Default skeleton bone names shared by the procedural providers. */
export declare const DEFAULT_PROVIDER_BONE_NAMES: string[];
/**
 * The DaytonaCanonicalHuman v0.1 asset contract (Priority 3).
 *
 * A provider produces this document. The runtime (Human) consumes `topology`
 * via the existing canonical adapter/validator, so the source of canonical
 * geometry is fully decoupled from the runtime — exactly the seam direction.md
 * requires. `landmarks` carry the surface-relative anatomical landmark set
 * (Priority 5).
 */
export interface CanonicalHumanAsset {
    /** Versioned spec tag, e.g. "DaytonaCanonicalHuman v0.1". */
    version: string;
    /** The validated in-memory mesh contract. */
    topology: CanonicalTopology;
    /** Stable anatomical landmarks (surface-relative). */
    landmarks: HumanLandmark[];
    metadata?: {
        author?: string;
        note?: string;
    };
}
export interface CanonicalValidationResult {
    valid: boolean;
    report: CanonicalValidationReport | null;
    issues: CanonicalValidationIssue[];
}
/**
 * The provider seam (Priority 2). The Human runtime does not care which provider
 * generated/loaded the topology; it only requires load() + validate().
 */
export interface CanonicalHumanProvider {
    /** Load (possibly asynchronously) the canonical asset. */
    load(): Promise<CanonicalHumanAsset>;
    /** Validate the currently-loaded asset (or the provider's static contract). */
    validate(): CanonicalValidationResult;
    /** Stable topology version string, e.g. "block-0.1" or "hd-head-0.1". */
    topologyVersion(): string;
}
/** Convert a CanonicalHuman into the validated CanonicalTopology shape. */
export declare function topologyFromHuman(canonical: CanonicalHuman): CanonicalTopology;
/**
 * The default debug/testing provider. Preserves the existing procedural block
 * human as the primary fallback while the HD provider is being developed.
 */
export declare class DebugBlockHumanProvider implements CanonicalHumanProvider {
    private boneNames;
    private landmarks;
    readonly version = "DaytonaCanonicalHuman v0.1";
    constructor(boneNames?: string[], landmarks?: HumanLandmark[]);
    private build;
    load(): Promise<CanonicalHumanAsset>;
    validate(): CanonicalValidationResult;
    topologyVersion(): string;
}
/** A named registry so the runtime can select a provider by key. */
export declare class CanonicalHumanProviderRegistry {
    private providers;
    register(key: string, provider: CanonicalHumanProvider): void;
    get(key: string): CanonicalHumanProvider | undefined;
    keys(): string[];
}
//# sourceMappingURL=canonical-provider.d.ts.map