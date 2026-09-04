import { CanonicalHuman } from './canonical-human.js';
import { CanonicalTopology } from './canonical-topology.js';
import { CanonicalValidationIssue } from './canonical-validator.js';
export interface CanonicalAdapterResult {
    ok: boolean;
    canonical: CanonicalHuman | null;
    report: {
        vertexCount: number;
        partCount: number;
        issues: CanonicalValidationIssue[];
    };
}
export interface CanonicalAssetAdapter {
    readonly name: string;
    readonly accepts: (asset: unknown) => asset is CanonicalTopology;
    readonly resolve: (asset: CanonicalTopology, boneNames: readonly string[]) => CanonicalHuman;
}
export declare class CanonicalTopologyAdapter implements CanonicalAssetAdapter {
    readonly name = "CanonicalTopologyAdapter";
    accepts(asset: unknown): asset is CanonicalTopology;
    resolve(asset: CanonicalTopology, boneNames: readonly string[]): CanonicalHuman;
    private static overlay;
}
export declare function adaptCanonicalTopologyAsset(asset: unknown, boneNames: readonly string[], adapter?: CanonicalAssetAdapter): CanonicalAdapterResult;
//# sourceMappingURL=canonical-adapter.d.ts.map