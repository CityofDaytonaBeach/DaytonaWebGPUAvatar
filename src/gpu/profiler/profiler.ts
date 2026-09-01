import { CanonicalHuman, RegionName } from "../../geometry/canonical/canonical-human";

export interface FrameMetrics {
  frameTimeMs: number;
  gpuTimeMs: number | null;
  cpuTimeMs: number;
  computePasses: number;
  drawCalls: number;
  dirtyRegions: string[];
  verticesModified: number;
  morphDeltaProcessed: number;
  activeLod: number;
}

/**
 * Development telemetry / profiler. Displays frame budgets, GPU & CPU time,
 * dirty regions, morph data processed. Essential for validating the delta
 * architecture (localized modifications should show tiny vertex/delta counts).
 */
export class HumanProfiler {
  private ring: FrameMetrics[] = [];
  private timestamps: number[] = [];

  beginFrame(): void {
    this.timestamps.push(performance.now());
    this.timestamps.push(performance.now());
  }

  record(partial: Partial<FrameMetrics>): FrameMetrics {
    const now = performance.now();
    const last = this.timestamps.pop() ?? now;
    const prev = this.timestamps.pop() ?? last;
    const cpuTimeMs = now - prev;
    const metrics: FrameMetrics = {
      frameTimeMs: now - last,
      gpuTimeMs: null,
      cpuTimeMs,
      computePasses: partial.computePasses ?? 0,
      drawCalls: partial.drawCalls ?? 0,
      dirtyRegions: partial.dirtyRegions ?? [],
      verticesModified: partial.verticesModified ?? 0,
      morphDeltaProcessed: partial.morphDeltaProcessed ?? 0,
      activeLod: partial.activeLod ?? 5,
      ...partial,
    };
    this.ring.push(metrics);
    if (this.ring.length > 240) this.ring.shift();
    return metrics;
  }

  /** Moving average CPU frame time over recent frames. */
  get averageCpuMs(): number {
    if (this.ring.length === 0) return 0;
    return this.ring.reduce((s, m) => s + m.cpuTimeMs, 0) / this.ring.length;
  }

  latest(): FrameMetrics | undefined {
    return this.ring[this.ring.length - 1];
  }

  /** Convenience summary for console/debug overlays. */
  summarize(): string {
    const m = this.latest();
    if (!m) return "no frames yet";
    return [
      `cpu ${m.cpuTimeMs.toFixed(2)}ms`,
      `gpu ${m.gpuTimeMs === null ? "n/a" : m.gpuTimeMs.toFixed(2) + "ms"}`,
      `passes ${m.computePasses}`,
      `draws ${m.drawCalls}`,
      `morph ${m.morphDeltaProcessed}`,
      `dirty [${m.dirtyRegions.join(",")}]`,
    ].join(" · ");
  }
}

/** Reports how many vertices a set of dirty regions actually touches. */
export function countDirtyVertices(
  canonical: CanonicalHuman,
  dirtyRegionNames: string[]
): number {
  const touched = new Set<number>();
  for (const name of dirtyRegionNames) {
    for (const region of regionsForDirtyName(name)) {
      for (const vertex of canonical.vertices) {
        if (vertex.region === region) touched.add(vertex.id);
      }
    }
  }
  return touched.size;
}

function regionsForDirtyName(name: string): RegionName[] {
  const normalized = name.toLowerCase();
  switch (normalized) {
    case "face":
      return ["face", "nose", "jaw", "eyes", "eye_sclera", "eye_iris", "mouth", "teeth", "tongue", "mouth_cavity"];
    case "body":
      return ["torso", "neck", "upperarm_l", "upperarm_r", "forearm_l", "forearm_r", "hand_l", "hand_r", "thigh_l", "thigh_r", "shin_l", "shin_r"];
    case "skeleton":
    case "global":
      return ["torso", "neck", "head", "face", "nose", "jaw", "eyes", "eye_sclera", "eye_iris", "mouth", "teeth", "tongue", "mouth_cavity", "upperarm_l", "upperarm_r", "forearm_l", "forearm_r", "hand_l", "hand_r", "thigh_l", "thigh_r", "shin_l", "shin_r"];
    default:
      return [normalized as RegionName];
  }
}
