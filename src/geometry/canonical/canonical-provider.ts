import { CanonicalHuman } from './canonical-human.js';
import { CanonicalTopology } from './canonical-topology.js';
import { HumanLandmark } from './landmark.js';
import {
  CanonicalValidationReport,
  CanonicalValidationIssue,
  validateCanonicalTopology,
} from './canonical-validator.js';

/** Default skeleton bone names shared by the procedural providers. */
export const DEFAULT_PROVIDER_BONE_NAMES = [
  'root',
  'pelvis',
  'spine_01',
  'spine_02',
  'chest',
  'neck',
  'head',
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
  metadata?: { author?: string; note?: string };
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
export function topologyFromHuman(canonical: CanonicalHuman): CanonicalTopology {
  return {
    vertices: canonical.vertices,
    indices: canonical.indices,
    parts: canonical.parts,
  };
}

/**
 * The default debug/testing provider. Preserves the existing procedural block
 * human as the primary fallback while the HD provider is being developed.
 */
export class DebugBlockHumanProvider implements CanonicalHumanProvider {
  readonly version = 'DaytonaCanonicalHuman v0.1';

  constructor(
    private boneNames: string[] = DEFAULT_PROVIDER_BONE_NAMES,
    private landmarks: HumanLandmark[] = [],
  ) {}

  private build(): CanonicalHumanAsset {
    const canonical = new CanonicalHuman([...this.boneNames]);
    return {
      version: this.version,
      topology: topologyFromHuman(canonical),
      landmarks: this.landmarks,
      metadata: { author: 'engine', note: 'procedural block human (debug/testing provider)' },
    };
  }

  async load(): Promise<CanonicalHumanAsset> {
    return this.build();
  }

  validate(): CanonicalValidationResult {
    const report = validateCanonicalTopology(this.build().topology);
    return { valid: report.valid, report, issues: report.issues };
  }

  topologyVersion(): string {
    return 'block-0.1';
  }
}

/** A named registry so the runtime can select a provider by key. */
export class CanonicalHumanProviderRegistry {
  private providers = new Map<string, CanonicalHumanProvider>();

  register(key: string, provider: CanonicalHumanProvider): void {
    this.providers.set(key, provider);
  }

  get(key: string): CanonicalHumanProvider | undefined {
    return this.providers.get(key);
  }

  keys(): string[] {
    return [...this.providers.keys()];
  }
}
