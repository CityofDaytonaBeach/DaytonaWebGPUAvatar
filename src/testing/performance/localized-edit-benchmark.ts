import { Human } from "../../human";
import { EventSource } from "../../core/events/character-event";
import { KernelKind } from "../../compiler/delta/delta-compiler";

export interface LocalizedEditBenchmarkCase {
  name: string;
  changes: Record<string, number>;
  source?: EventSource;
}

export interface LocalizedEditBenchmarkResult {
  name: string;
  cancelled: boolean;
  cpuTimeMs: number;
  gpuTimeMs: number | null;
  dirtyRegions: string[];
  computePasses: number;
  kernelKinds: KernelKind[];
  verticesModified: number;
  morphDeltaProcessed: number;
}

export interface LocalizedEditBenchmarkSummary {
  baselineVertexCount: number;
  results: LocalizedEditBenchmarkResult[];
}

export const DEFAULT_LOCALIZED_EDIT_BENCHMARKS: LocalizedEditBenchmarkCase[] = [
  { name: "nose width localized edit", changes: { "face.nose.width": 0.9 }, source: "automation" },
  { name: "jaw width localized edit", changes: { "face.jaw.width": 1.1 }, source: "automation" },
  { name: "body muscularity broader edit", changes: { "body.muscularity": 0.72 }, source: "automation" },
  { name: "hair cosmetic edit", changes: { "hair.length": 0.7 }, source: "automation" },
];

export async function runLocalizedEditBenchmark(
  cases: readonly LocalizedEditBenchmarkCase[] = DEFAULT_LOCALIZED_EDIT_BENCHMARKS,
  createHuman: () => Promise<Human> = () => Human.create()
): Promise<LocalizedEditBenchmarkSummary> {
  const results: LocalizedEditBenchmarkResult[] = [];
  let baselineVertexCount = 0;

  for (const item of cases) {
    const human = await createHuman();
    baselineVertexCount = human.canonicalRef.vertexCount;
    const start = nowMs();
    const result = human.modify(item.changes, item.source ?? "automation");
    const cpuTimeMs = nowMs() - start;
    const metrics = human.profiler.latest();

    results.push({
      name: item.name,
      cancelled: result.cancelled,
      cpuTimeMs,
      gpuTimeMs: null,
      dirtyRegions: result.dirtyRegions,
      computePasses: result.affectedKernelWork.length,
      kernelKinds: result.affectedKernelWork.map((work) => work.kind),
      verticesModified: metrics?.verticesModified ?? 0,
      morphDeltaProcessed: metrics?.morphDeltaProcessed ?? 0,
    });
  }

  return { baselineVertexCount, results };
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}
