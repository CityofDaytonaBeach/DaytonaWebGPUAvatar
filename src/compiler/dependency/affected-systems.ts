import { PropertyCategory } from '../../core/schema/property.js';
import { PropertyRegistry } from '../../core/schema/registry.js';
import { DependencyGraph } from './dependency-graph.js';

export type AffectedSystemName =
  | 'Global'
  | 'Identity'
  | 'Skeleton'
  | 'BodyGeometry'
  | 'FaceGeometry'
  | 'SkinMaterial'
  | 'EyeSystem'
  | 'HairSystem'
  | 'Expression'
  | 'Animation'
  | 'Physics'
  | 'LOD'
  | 'Attachment';

export interface AffectedSystem {
  system: AffectedSystemName;
  directPropertyIds: number[];
  dependentPropertyIds: number[];
  propertyPaths: string[];
}

export function affectedSystemsForChange(
  registry: PropertyRegistry,
  graph: DependencyGraph,
  changedIds: readonly number[],
): AffectedSystem[] {
  const direct = new Set(changedIds);
  const affected = graph.affectedBy([...changedIds]);
  const bySystem = new Map<AffectedSystemName, AffectedSystem>();

  for (const id of affected) {
    const meta = registry.requireId(id);
    const system = systemForCategory(meta.category as PropertyCategory);
    let entry = bySystem.get(system);
    if (!entry) {
      entry = { system, directPropertyIds: [], dependentPropertyIds: [], propertyPaths: [] };
      bySystem.set(system, entry);
    }
    if (direct.has(id)) entry.directPropertyIds.push(id);
    else entry.dependentPropertyIds.push(id);
    entry.propertyPaths.push(meta.path);
  }

  return [...bySystem.values()].sort((a, b) => a.system.localeCompare(b.system));
}

export function systemForCategory(category: PropertyCategory): AffectedSystemName {
  switch (category) {
    case PropertyCategory.Global:
      return 'Global';
    case PropertyCategory.Identity:
      return 'Identity';
    case PropertyCategory.Skeleton:
      return 'Skeleton';
    case PropertyCategory.Body:
      return 'BodyGeometry';
    case PropertyCategory.Face:
      return 'FaceGeometry';
    case PropertyCategory.Skin:
      return 'SkinMaterial';
    case PropertyCategory.Eyes:
      return 'EyeSystem';
    case PropertyCategory.Hair:
      return 'HairSystem';
    case PropertyCategory.Expression:
      return 'Expression';
    case PropertyCategory.Animation:
      return 'Animation';
    case PropertyCategory.Physics:
      return 'Physics';
    case PropertyCategory.LOD:
      return 'LOD';
    case PropertyCategory.Attachment:
      return 'Attachment';
    default:
      return 'Global';
  }
}
