import { PropertyCategory } from '../../core/schema/property.js';
import { PropertyRegistry } from '../../core/schema/registry.js';
import { DependencyGraph } from './dependency-graph.js';
export type AffectedSystemName = 'Global' | 'Identity' | 'Skeleton' | 'BodyGeometry' | 'FaceGeometry' | 'SkinMaterial' | 'EyeSystem' | 'HairSystem' | 'Expression' | 'Animation' | 'Physics' | 'LOD' | 'Attachment';
export interface AffectedSystem {
    system: AffectedSystemName;
    directPropertyIds: number[];
    dependentPropertyIds: number[];
    propertyPaths: string[];
}
export declare function affectedSystemsForChange(registry: PropertyRegistry, graph: DependencyGraph, changedIds: readonly number[]): AffectedSystem[];
export declare function systemForCategory(category: PropertyCategory): AffectedSystemName;
//# sourceMappingURL=affected-systems.d.ts.map