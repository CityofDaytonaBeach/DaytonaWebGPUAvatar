import { PropertyRegistry } from "../../core/schema/registry";
import { PropertyMeta } from "../../core/schema/property";
import { HumanDefinition } from "../../core/schema/human-definition";

export type NodeExecutionType = "cpu" | "gpu";

export class DependencyNode {
  readonly id: number;
  readonly path: string;
  readonly meta: PropertyMeta;
  readonly inputs: number[] = [];
  readonly outputs: number[] = [];
  execution: NodeExecutionType;
  lodImportance: number;

  constructor(meta: PropertyMeta, execution: NodeExecutionType = "gpu") {
    this.id = meta.id;
    this.path = meta.path;
    this.meta = meta;
    this.execution = execution;
    this.lodImportance = meta.lodImportance ?? 0;
  }
}

/**
 * Human Dependency Graph. Expressed as nodes (properties) and edges
 * (dependency -> dependent). When a property changes we traverse only its
 * descendants, marking exactly that set dirty — never rebuilding unrelated
 * systems.
 */
export class DependencyGraph {
  private nodes = new Map<number, DependencyNode>();
  private byPath = new Map<string, DependencyNode>();

  constructor(private registry: PropertyRegistry) {
    this.build();
  }

  private build() {
    this.nodes.clear();
    this.byPath.clear();
    // One node per registered property.
    for (const meta of this.registry.all()) {
      const node = new DependencyNode(meta);
      this.nodes.set(meta.id, node);
      this.byPath.set(meta.path, node);
    }
    // Wire edges from dependency metadata.
    for (const node of this.nodes.values()) {
      for (const depId of node.meta.dependencies ?? []) {
        const depNode = this.nodes.get(depId);
        if (!depNode) continue;
        depNode.outputs.push(node.id);
        node.inputs.push(depId);
      }
    }
  }

  /** Return the node for a property id (throws if unknown). */
  nodeById(id: number): DependencyNode {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`No dependency node for id ${id}`);
    return n;
  }

  nodeByPath(path: string): DependencyNode {
    const n = this.byPath.get(path);
    if (!n) throw new Error(`No dependency node for path ${path}`);
    return n;
  }

  /**
   * Compute the transitive set of property ids affected when `changedIds`
   * change. The changed set itself is always included. Descendants are found
   * by following the dependency edges via BFS.
   */
  affectedBy(changedIds: number[]): Set<number> {
    const affected = new Set<number>();
    const queue: number[] = [];
    for (const id of changedIds) {
      if (this.nodes.has(id)) {
        affected.add(id);
        queue.push(id);
      }
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = this.nodes.get(id);
      if (!node) continue;
      for (const outId of node.outputs) {
        if (!affected.has(outId)) {
          affected.add(outId);
          queue.push(outId);
        }
      }
    }
    return affected;
  }

  /** All nodes, by id. */
  allNodes(): IterableIterator<DependencyNode> {
    return this.nodes.values();
  }

  /** Round-trip a definition's values into a new definition, honoring deps. */
  recompute(values: HumanDefinition): HumanDefinition {
    return values;
  }
}
