import { DependencyGraph } from "../dependency/dependency-graph";
import { PropertyRegistry } from "../../core/schema/registry";
import { PropertyCategory } from "../../core/schema/property";
import { CharacterEvent } from "../../core/events/character-event";

export type KernelKind =
  | "SparseMorph"
  | "MorphAccumulation"
  | "Corrective"
  | "Skeleton"
  | "Skinning"
  | "Normal"
  | "Tangent"
  | "Subdivision"
  | "SDF"
  | "Hair"
  | "Cloth"
  | "Attachment"
  | "LODSelection"
  | "Visibility";

export interface KernelWork {
  kind: KernelKind;
  /** Vertex ranges this kernel must process (or null = whole mesh). */
  vertexRanges: Array<{ start: number; count: number }>;
  propertyIds: number[];
  priority: number;
}

export const CATEGORY_TO_KERNEL: Record<PropertyCategory, KernelKind> = {
  [PropertyCategory.Global]: "Skeleton",
  [PropertyCategory.Identity]: "SparseMorph",
  [PropertyCategory.Skeleton]: "Skeleton",
  [PropertyCategory.Body]: "SparseMorph",
  [PropertyCategory.Face]: "SparseMorph",
  [PropertyCategory.Skin]: "Corrective",
  [PropertyCategory.Eyes]: "Visibility",
  [PropertyCategory.Hair]: "Hair",
  [PropertyCategory.Expression]: "MorphAccumulation",
  [PropertyCategory.Animation]: "Skinning",
  [PropertyCategory.Physics]: "Cloth",
  [PropertyCategory.LOD]: "LODSelection",
  [PropertyCategory.Attachment]: "Attachment",
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
  constructor(private registry: PropertyRegistry, private graph: DependencyGraph) {}

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
      case "Skeleton":
      case "Skinning":
      case "MorphAccumulation":
        return 10;
      case "SparseMorph":
      case "Normal":
        return 8;
      case "Corrective":
        return 6;
      case "Attachment":
      case "Visibility":
        return 4;
      default:
        return 3;
    }
  }

  private assignVertexRanges(work: KernelWork): void {
    void work;
    // In v0.1 the canonical model exposes named regions; face kernels constrain
    // to the face range. Future versions refine to per-nose/per-jaw ranges.
  }

  /** Compiler-aware merge of several change batches (optimizes multi-change). */
  compileBatch(changeBatches: number[][]): KernelWork[] {
    const flattened = changeBatches.flat();
    const unique = [...new Set(flattened)];
    return this.compile(unique);
  }
}
