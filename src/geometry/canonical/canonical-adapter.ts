import { CanonicalHuman, PartGeometry, IndexRange } from "./canonical-human";
import { CanonicalTopology, CanonicalTopologyPart } from "./canonical-topology";
import { validateCanonicalTopology, CanonicalValidationIssue, REQUIRED_CANONICAL_PARTS } from "./canonical-validator";

export interface CanonicalAdapterResult {
  ok: boolean;
  canonical: CanonicalHuman | null;
  report: { vertexCount: number; partCount: number; issues: CanonicalValidationIssue[] };
}

export interface CanonicalAssetAdapter {
  readonly name: string;
  readonly accepts: (asset: unknown) => asset is CanonicalTopology;
  readonly resolve: (asset: CanonicalTopology, boneNames: readonly string[]) => CanonicalHuman;
}

export class CanonicalTopologyAdapter implements CanonicalAssetAdapter {
  readonly name = "CanonicalTopologyAdapter";

  accepts(asset: unknown): asset is CanonicalTopology {
    if (!asset || typeof asset !== "object") return false;
    const candidate = asset as CanonicalTopology;
    return (
      Array.isArray(candidate.vertices) &&
      candidate.indices instanceof Uint32Array &&
      Array.isArray(candidate.parts)
    );
  }

  resolve(asset: CanonicalTopology, boneNames: readonly string[]): CanonicalHuman {
    if (!this.accepts(asset)) throw new TypeError(`${this.name}: asset does not match CanonicalTopology`);

    const parts: PartGeometry[] = asset.parts.map((part) => ({
      name: part.name,
      kind: part.kind,
      region: part.region,
      vertexStart: part.vertexStart,
      vertexCount: part.vertexCount,
      indexStart: part.indexStart,
      indexCount: part.indexCount,
    }));

    const canonical = new CanonicalHuman(boneNames);
    return CanonicalTopologyAdapter.overlay(canonical, asset.vertices, asset.indices, parts);
  }

  private static overlay(
    canonical: CanonicalHuman,
    vertices: CanonicalTopology["vertices"],
    indices: Uint32Array,
    parts: PartGeometry[]
  ): CanonicalHuman {
    (canonical as { vertices: typeof canonical.vertices }).vertices = Array.from(vertices);
    (canonical as { indices: typeof canonical.indices }).indices = indices;
    (canonical as { parts: typeof canonical.parts }).parts = parts;

    const regions = new Map<string, IndexRange>();
    for (let i = 0; i < vertices.length; i++) {
      const r = vertices[i].region;
      if (!regions.has(r)) regions.set(r, { start: i, count: 0 });
      regions.get(r)!.count++;
    }
    (canonical as { regionRanges: typeof canonical.regionRanges }).regionRanges = new Map(regions);

    const partByRegion = new Map<string, PartGeometry>();
    for (const part of parts) partByRegion.set(part.region, part);
    (canonical as { partByRegion: typeof canonical.partByRegion }).partByRegion = partByRegion;

    for (const part of parts) {
      (canonical.partIndexRanges as Map<string, IndexRange>).set(part.name, { start: part.indexStart, count: part.indexCount });
    }
    return canonical;
  }
}

export function adaptCanonicalTopologyAsset(
  asset: unknown,
  boneNames: readonly string[],
  adapter: CanonicalAssetAdapter = new CanonicalTopologyAdapter()
): CanonicalAdapterResult {
  if (!adapter.accepts(asset)) {
    return {
      ok: false,
      canonical: null,
      report: { vertexCount: 0, partCount: 0, issues: [{ code: "archetype-mismatch", message: `${adapter.name} does not accept this asset` }] },
    };
  }
  const topology = asset as CanonicalTopology;
  const validation = validateCanonicalTopology(topology);
  if (!validation.valid) {
    return {
      ok: false,
      canonical: null,
      report: { vertexCount: validation.vertexCount, partCount: validation.partCount, issues: validation.issues },
    };
  }
  const canonical = adapter.resolve(topology, boneNames);
  return {
    ok: true,
    canonical,
    report: { vertexCount: canonical.vertexCount, partCount: canonical.parts.length, issues: [] },
  };
}

export function requiredPartNames(): readonly string[] {
  return REQUIRED_CANONICAL_PARTS as readonly string[];
}