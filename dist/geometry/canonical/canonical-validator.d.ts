import { RegionName } from './canonical-human.js';
import { CanonicalTopology, CanonicalTopologyPart, CanonicalTopologyVertex } from './canonical-topology.js';
export interface CanonicalValidationIssue {
    code: string;
    message: string;
}
export interface CanonicalValidationReport {
    valid: boolean;
    vertexCount: number;
    triangleCount: number;
    partCount: number;
    regionCount: number;
    issues: CanonicalValidationIssue[];
}
export declare const REQUIRED_CANONICAL_REGIONS: RegionName[];
export declare const REQUIRED_CANONICAL_PARTS: readonly ["eye_l", "eye_r", "iris_l", "iris_r", "pupil_l", "pupil_r", "teeth_upper", "teeth_lower", "tongue", "mouth_cavity"];
export declare function validateCanonicalTopology(topology: CanonicalTopology): CanonicalValidationReport;
export declare function validateCanonicalHuman(canonical: CanonicalHumanLike): CanonicalValidationReport;
interface CanonicalHumanLike {
    vertices: readonly CanonicalTopologyVertex[];
    indices: Uint32Array;
    parts: readonly CanonicalTopologyPart[];
}
export {};
//# sourceMappingURL=canonical-validator.d.ts.map