import { describe, expect, it } from "vitest";
import { runLocalizedEditBenchmark } from "./localized-edit-benchmark";

describe("localized edit benchmark", () => {
  it("reports real event-path metrics for default benchmark cases", async () => {
    const summary = await runLocalizedEditBenchmark();

    expect(summary.baselineVertexCount).toBeGreaterThan(0);
    expect(summary.results.map((item) => item.name)).toContain("nose width localized edit");
    expect(summary.results.every((item) => item.cancelled === false)).toBe(true);
    expect(summary.results.every((item) => item.gpuTimeMs === null)).toBe(true);
  });

  it("proves nose edits stay in face/sparse-morph work instead of hair", async () => {
    const summary = await runLocalizedEditBenchmark();
    const nose = summary.results.find((item) => item.name === "nose width localized edit")!;

    expect(nose.dirtyRegions).toContain("Face");
    expect(nose.kernelKinds).toContain("SparseMorph");
    expect(nose.kernelKinds).not.toContain("Hair");
  });

  it("separates cosmetic hair edits from face edits", async () => {
    const summary = await runLocalizedEditBenchmark();
    const hair = summary.results.find((item) => item.name === "hair cosmetic edit")!;

    expect(hair.dirtyRegions).toContain("Hair");
    expect(hair.kernelKinds).toContain("Hair");
    expect(hair.dirtyRegions).not.toContain("Face");
  });
});
