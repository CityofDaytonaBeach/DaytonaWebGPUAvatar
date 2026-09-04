import { CanonicalHuman } from './canonical-human.js';
import { validateCanonicalTopology, } from './canonical-validator.js';
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
/** Convert a CanonicalHuman into the validated CanonicalTopology shape. */
export function topologyFromHuman(canonical) {
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
export class DebugBlockHumanProvider {
    boneNames;
    landmarks;
    version = 'DaytonaCanonicalHuman v0.1';
    constructor(boneNames = DEFAULT_PROVIDER_BONE_NAMES, landmarks = []) {
        this.boneNames = boneNames;
        this.landmarks = landmarks;
    }
    build() {
        const canonical = new CanonicalHuman([...this.boneNames]);
        return {
            version: this.version,
            topology: topologyFromHuman(canonical),
            landmarks: this.landmarks,
            metadata: { author: 'engine', note: 'procedural block human (debug/testing provider)' },
        };
    }
    async load() {
        return this.build();
    }
    validate() {
        const report = validateCanonicalTopology(this.build().topology);
        return { valid: report.valid, report, issues: report.issues };
    }
    topologyVersion() {
        return 'block-0.1';
    }
}
/** A named registry so the runtime can select a provider by key. */
export class CanonicalHumanProviderRegistry {
    providers = new Map();
    register(key, provider) {
        this.providers.set(key, provider);
    }
    get(key) {
        return this.providers.get(key);
    }
    keys() {
        return [...this.providers.keys()];
    }
}
//# sourceMappingURL=canonical-provider.js.map