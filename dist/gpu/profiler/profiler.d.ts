import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
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
export declare class HumanProfiler {
    private ring;
    private timestamps;
    beginFrame(): void;
    record(partial: Partial<FrameMetrics>): FrameMetrics;
    /** Moving average CPU frame time over recent frames. */
    get averageCpuMs(): number;
    latest(): FrameMetrics | undefined;
    /** Convenience summary for console/debug overlays. */
    summarize(): string;
}
/** Reports how many vertices a set of dirty regions actually touches. */
export declare function countDirtyVertices(canonical: CanonicalHuman, dirtyRegionNames: string[]): number;
//# sourceMappingURL=profiler.d.ts.map