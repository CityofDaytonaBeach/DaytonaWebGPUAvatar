import { BoneDef } from '../skeleton/skeleton.js';
import { AnatomyDimensions } from '../parametric/parametric-anatomy.js';
import { Vec3 } from '../../core/math/vec.js';
export type InternalAnatomyMode = 'normal' | 'skeleton' | 'muscle' | 'anatomy' | 'transparentSkin';
export type InternalAnatomyPrimitiveKind = 'joint' | 'bone' | 'muscle';
export interface InternalAnatomyPrimitive {
    kind: InternalAnatomyPrimitiveKind;
    name: string;
    a: Vec3;
    b?: Vec3;
    radius: number;
    color: [number, number, number];
}
export interface InternalAnatomyView {
    mode: InternalAnatomyMode;
    showSkin: boolean;
    skinOpacity: number;
    primitives: InternalAnatomyPrimitive[];
}
export type OrganSystemMode = 'skeletal' | 'muscular' | 'circulatory' | 'nervous';
export declare const ORGAN_SYSTEM_COLORS: Record<OrganSystemMode, [number, number, number]>;
export interface InternalAnatomyRenderData {
    count: number;
    positions: Float32Array;
    colors: Float32Array;
    radii: Float32Array;
}
export interface PrimitiveVolume {
    name: string;
    kind: InternalAnatomyPrimitiveKind;
    volume: number;
}
export type JointMarkerShape = 'sphere' | 'cone';
export interface JointVisualization {
    name: string;
    position: Vec3;
    shape: JointMarkerShape;
    radius: number;
    color: [number, number, number];
}
export interface BoneFracture {
    boneName: string;
    fracturePoint: Vec3;
    severity: number;
    displacement: Vec3;
}
export interface FractureVisualization {
    fracture: BoneFracture;
    visual: InternalAnatomyPrimitive;
}
export interface MuscleActivation {
    muscleName: string;
    activation: number;
}
export interface HeatmapSample {
    worldPosition: Vec3;
    value: number;
}
export interface HeatmapOverlay {
    samples: HeatmapSample[];
    min: number;
    max: number;
    colors: [number, number, number][];
}
/**
 * Deterministic internal-anatomy prototype. It derives skeleton and major muscle
 * display primitives from the same parametric anatomy/skeleton used by skinning,
 * so anatomy modes remain modular and never become the source of character truth.
 */
export declare function buildInternalAnatomyView(dims: AnatomyDimensions, skeleton: BoneDef[], mode?: InternalAnatomyMode): InternalAnatomyView;
export declare function buildOrganSystemView(dims: AnatomyDimensions, skeleton: BoneDef[], system: OrganSystemMode): InternalAnatomyView;
export declare function buildRenderData(primitives: InternalAnatomyPrimitive[]): InternalAnatomyRenderData;
export declare function estimatePrimitiveVolume(p: InternalAnatomyPrimitive): number;
export declare function estimateAllVolumes(primitives: InternalAnatomyPrimitive[]): PrimitiveVolume[];
export declare function totalVolume(volumes: PrimitiveVolume[]): number;
export declare function buildJointVisualizations(skeleton: BoneDef[], dims: AnatomyDimensions, markerShape?: JointMarkerShape): JointVisualization[];
export declare function visualizeFracture(fracture: BoneFracture, skeleton: BoneDef[], dims: AnatomyDimensions): FractureVisualization;
export declare function applyMuscleActivation(primitives: InternalAnatomyPrimitive[], activations: MuscleActivation[]): InternalAnatomyPrimitive[];
export declare function applyHeatmapOverlay(primitives: InternalAnatomyPrimitive[], heatmap: HeatmapOverlay): InternalAnatomyPrimitive[];
export declare function buildAnatomyRenderPipeline(dims: AnatomyDimensions, skeleton: BoneDef[], system: OrganSystemMode, activations?: MuscleActivation[], heatmap?: HeatmapOverlay): {
    view: InternalAnatomyView;
    renderData: InternalAnatomyRenderData;
    volumes: PrimitiveVolume[];
};
//# sourceMappingURL=internal-anatomy.d.ts.map