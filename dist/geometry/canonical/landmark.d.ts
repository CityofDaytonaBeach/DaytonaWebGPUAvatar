import { CanonicalHuman } from './canonical-human.js';
/**
 * A stable anatomical landmark, represented surface-relatively so it survives
 * deformation: it lives on a triangle (referenced by stable id) at a barycentric
 * coordinate, offset a fixed distance along the interpolated normal.
 */
export interface HumanLandmark {
    id: number;
    name: string;
    /** Stable triangle id (index into canonical.indices / 3). */
    triangleId: number;
    /** Barycentric coordinates of the landmark within that triangle. */
    barycentric: [number, number, number];
    /** Perpendicular offset along the interpolated normal (metres). */
    normalOffset: number;
}
export interface ResolvedLandmark {
    landmark: HumanLandmark;
    position: {
        x: number;
        y: number;
        z: number;
    };
    normal: {
        x: number;
        y: number;
        z: number;
    };
}
/**
 * Resolve a surface-relative landmark to a world position given the canonical
 * human. If the referenced triangle is invalid (deleted topology or out of
 * range), returns null. Deterministic.
 */
export declare function resolveLandmarkPosition(canonical: CanonicalHuman, landmark: HumanLandmark): ResolvedLandmark | null;
/** Find a triangle id whose region matches `region`; returns -1 if none. */
export declare function findTriangleInRegion(canonical: CanonicalHuman, region: string): number;
//# sourceMappingURL=landmark.d.ts.map