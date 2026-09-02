import { DependencyGraph } from '../dependency/dependency-graph.js';
import { PropertyRegistry } from '../../core/schema/registry.js';
import { PropertyCategory } from '../../core/schema/property.js';
import { IndexRange, RegionName } from '../../geometry/canonical/canonical-human.js';

export type KernelKind =
  | 'SparseMorph'
  | 'MorphAccumulation'
  | 'Corrective'
  | 'Skeleton'
  | 'Skinning'
  | 'Normal'
  | 'Tangent'
  | 'Subdivision'
  | 'SDF'
  | 'Hair'
  | 'Cloth'
  | 'Attachment'
  | 'LODSelection'
  | 'Visibility';

export interface KernelWork {
  kind: KernelKind;
  /** Vertex ranges this kernel must process (or null = whole mesh). */
  vertexRanges: Array<{ start: number; count: number }>;
  propertyIds: number[];
  priority: number;
}

export interface DeltaVertexRangeSource {
  regionRanges: ReadonlyMap<RegionName, IndexRange>;
}

export const CATEGORY_TO_KERNEL: Record<PropertyCategory, KernelKind> = {
  [PropertyCategory.Global]: 'Skeleton',
  [PropertyCategory.Identity]: 'SparseMorph',
  [PropertyCategory.Skeleton]: 'Skeleton',
  [PropertyCategory.Body]: 'SparseMorph',
  [PropertyCategory.Face]: 'SparseMorph',
  [PropertyCategory.Skin]: 'Corrective',
  [PropertyCategory.Eyes]: 'Visibility',
  [PropertyCategory.Hair]: 'Hair',
  [PropertyCategory.Expression]: 'MorphAccumulation',
  [PropertyCategory.Animation]: 'Skinning',
  [PropertyCategory.Physics]: 'Cloth',
  [PropertyCategory.LOD]: 'LODSelection',
  [PropertyCategory.Attachment]: 'Attachment',
};

/**
 * Human Delta Compiler.
 *
 * Input : Current Human State + Character Event(s)
 * Output: minimal required GPU computation, as a list of kernel work items.
 *
 * The compiler merges overlapping work across simultaneous changes instead of
 * dispatching redundant passes. Unaffected systems produce no output.
 */
export class DeltaCompiler {
  constructor(
    private registry: PropertyRegistry,
    private graph: DependencyGraph,
    private ranges?: DeltaVertexRangeSource,
  ) {}

  /**
   * Given the set of changed property ids, compute the minimal kernel work.
   * Merges changes that map to the same kernel kind.
   */
  compile(changedIds: number[]): KernelWork[] {
    const affected = this.graph.affectedBy(changedIds);

    const merged = new Map<KernelKind, KernelWork>();
    for (const id of affected) {
      const meta = this.registry.requireId(id);
      const kind = CATEGORY_TO_KERNEL[meta.category as PropertyCategory];
      if (!kind) continue;
      let work = merged.get(kind);
      if (!work) {
        work = { kind, vertexRanges: [], propertyIds: [], priority: this.priorityFor(kind) };
        merged.set(kind, work);
      }
      work.propertyIds.push(id);
    }

    // Attach vertex ranges derived from property region mapping (v0.1 heuristic:
    // face/skin/expression affects the face vertex range; body affects whole body).
    const result: KernelWork[] = [];
    for (const work of merged.values()) {
      this.assignVertexRanges(work);
      result.push(work);
    }
    return result;
  }

  private priorityFor(kind: KernelKind): number {
    switch (kind) {
      case 'Skeleton':
      case 'Skinning':
      case 'MorphAccumulation':
        return 10;
      case 'SparseMorph':
      case 'Normal':
        return 8;
      case 'Corrective':
        return 6;
      case 'Attachment':
      case 'Visibility':
        return 4;
      default:
        return 3;
    }
  }

  private assignVertexRanges(work: KernelWork): void {
    if (!this.ranges) return;
    const regions = new Set<RegionName>();
    for (const id of work.propertyIds) {
      const meta = this.registry.requireId(id);
      for (const region of regionsForProperty(meta.path, meta.category as PropertyCategory))
        regions.add(region);
    }
    work.vertexRanges = mergeRanges(
      [...regions]
        .map((region) => this.ranges?.regionRanges.get(region))
        .filter((range): range is IndexRange => !!range),
    );
  }

  /** Compiler-aware merge of several change batches (optimizes multi-change). */
  compileBatch(changeBatches: number[][]): KernelWork[] {
    const flattened = changeBatches.flat();
    const unique = [...new Set(flattened)];
    return this.compile(unique);
  }
}

function regionsForProperty(path: string, category: PropertyCategory): RegionName[] {
  if (path.startsWith('face.nose.')) return ['nose'];
  if (path.startsWith('face.jaw.')) return ['jaw'];
  if (path.startsWith('face.mouth.')) return ['mouth'];
  if (path === 'face.eyeSpacing') return ['eyes', 'eye_sclera', 'eye_iris'];
  if (path.startsWith('face.')) return ['face', 'nose', 'jaw', 'eyes', 'mouth'];
  if (path.startsWith('expression.'))
    return ['face', 'jaw', 'mouth', 'tongue', 'mouth_cavity', 'eyes'];
  if (
    path === 'body.muscularity' ||
    path === 'body.bodyFat' ||
    path === 'body.chest' ||
    path === 'body.waist' ||
    path === 'body.hips'
  )
    return ['torso'];
  if (path.startsWith('skeleton.') || path.startsWith('global.'))
    return [
      'torso',
      'neck',
      'head',
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
    ];
  if (category === PropertyCategory.Skin)
    return [
      'torso',
      'neck',
      'head',
      'face',
      'nose',
      'jaw',
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
    ];
  return [];
}

function mergeRanges(ranges: IndexRange[]): IndexRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: IndexRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.start + last.count >= range.start) {
      const end = Math.max(last.start + last.count, range.start + range.count);
      last.count = end - last.start;
    } else {
      merged.push({ start: range.start, count: range.count });
    }
  }
  return merged;
}
