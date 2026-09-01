import { Human } from "../../human";
import { EventSource } from "../../core/events/character-event";
import { KernelKind } from "../../compiler/delta/delta-compiler";
import { AffectedSystemName } from "../../compiler/dependency/affected-systems";

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
  affectedSystems: AffectedSystemName[];
  computePasses: number;
  kernelKinds: KernelKind[];
  verticesModified: number;
  morphDeltaProcessed: number;
}

export interface LocalizedEditBenchmarkSummary {
  baselineVertexCount: number;
  results: LocalizedEditBenchmarkResult[];
}

export interface GpuTimestampBenchmarkOptions {
  device?: GPUDevice;
  format?: GPUTextureFormat;
  width?: number;
  height?: number;
  cases?: readonly LocalizedEditBenchmarkCase[];
}

export interface GpuTimestampBenchmarkResult {
  supported: boolean;
  reason?: string;
  cpuSummary: LocalizedEditBenchmarkSummary;
}

interface TimestampCommandEncoder extends GPUCommandEncoder {
  writeTimestamp?: (querySet: GPUQuerySet, queryIndex: number) => void;
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
      affectedSystems: result.affectedSystems.map((system) => system.system),
      computePasses: result.affectedKernelWork.length,
      kernelKinds: result.affectedKernelWork.map((work) => work.kind),
      verticesModified: metrics?.verticesModified ?? 0,
      morphDeltaProcessed: metrics?.morphDeltaProcessed ?? 0,
    });
  }

  return { baselineVertexCount, results };
}

export async function runLocalizedEditGpuTimestampBenchmark(
  options: GpuTimestampBenchmarkOptions = {}
): Promise<GpuTimestampBenchmarkResult> {
  const cases = options.cases ?? DEFAULT_LOCALIZED_EDIT_BENCHMARKS;
  if (!options.device) {
    return { supported: false, reason: "GPU device not provided", cpuSummary: await runLocalizedEditBenchmark(cases) };
  }
  if (!options.device.features.has("timestamp-query")) {
    return { supported: false, reason: "timestamp-query feature is not enabled on this GPUDevice", cpuSummary: await runLocalizedEditBenchmark(cases) };
  }
  const probe = options.device.createCommandEncoder() as TimestampCommandEncoder;
  if (typeof probe.writeTimestamp !== "function") {
    return { supported: false, reason: "GPUCommandEncoder.writeTimestamp is not available in this runtime", cpuSummary: await runLocalizedEditBenchmark(cases) };
  }

  const device = options.device;
  const format = options.format ?? "bgra8unorm";
  const width = options.width ?? 64;
  const height = options.height ?? 64;
  const results: LocalizedEditBenchmarkResult[] = [];
  let baselineVertexCount = 0;

  for (const item of cases) {
    const human = await Human.create({ device, format });
    baselineVertexCount = human.canonicalRef.vertexCount;
    const texture = device.createTexture({ size: { width, height }, format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const view = texture.createView();
    const querySet = device.createQuerySet({ type: "timestamp", count: 2 });
    const resolveBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    const readBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

    const start = nowMs();
    const result = human.modify(item.changes, item.source ?? "automation");
    human.uploadGpu();
    const encoder = device.createCommandEncoder() as TimestampCommandEncoder;
    encoder.writeTimestamp!(querySet, 0);
    human.gpuPipeline?.render(encoder, view, width, height);
    encoder.writeTimestamp!(querySet, 1);
    encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
    encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, 16);
    device.queue.submit([encoder.finish()]);
    await readBuffer.mapAsync(GPUMapMode.READ);
    const timestamps = new BigUint64Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    const gpuTimeMs = Number(timestamps[1] - timestamps[0]) / 1_000_000;
    const cpuTimeMs = nowMs() - start;
    const metrics = human.profiler.latest();

    results.push({
      name: item.name,
      cancelled: result.cancelled,
      cpuTimeMs,
      gpuTimeMs,
      dirtyRegions: result.dirtyRegions,
      affectedSystems: result.affectedSystems.map((system) => system.system),
      computePasses: result.affectedKernelWork.length,
      kernelKinds: result.affectedKernelWork.map((work) => work.kind),
      verticesModified: metrics?.verticesModified ?? 0,
      morphDeltaProcessed: metrics?.morphDeltaProcessed ?? 0,
    });

    querySet.destroy();
    resolveBuffer.destroy();
    readBuffer.destroy();
    texture.destroy();
  }

  return { supported: true, cpuSummary: { baselineVertexCount, results } };
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}
