import { describe, expect, it } from "vitest";
import { Human } from "../human";

describe("perceptual validation prototype", () => {
  it("returns a clean report for the default human", async () => {
    const human = await Human.create();
    const report = human.validatePerceptual();

    expect(report.score).toBe(1);
    expect(report.issues).toEqual([]);
    expect(report.correctiveRequests).toEqual([]);
  });

  it("detects anatomy and eye spacing issues without mutating state", async () => {
    const human = await Human.create();
    human.modify({ "body.waist": 1.8, "face.eyeSpacing": 1.35 });
    const before = human.definitionRef.serialize();

    const report = human.validatePerceptual();

    expect(report.score).toBeLessThan(1);
    expect(report.issues.map((i) => i.kind)).toContain("anatomy.proportion");
    expect(report.issues.map((i) => i.kind)).toContain("eye.alignment");
    expect(report.correctiveRequests.length).toBeGreaterThan(0);
    expect(human.definitionRef.serialize()).toEqual(before);
  });

  it("emits structured corrective requests for the normal event pipeline", async () => {
    const human = await Human.create();
    human.modify({ "expression.tongueOut": 1, "expression.jawOpen": 0 });

    const report = human.validatePerceptual();
    const correction = report.correctiveRequests.find((e) => e.changes?.["expression.jawOpen"] !== undefined);

    expect(report.issues.map((i) => i.kind)).toContain("mouth.intersection");
    expect(correction?.type).toBe("set");
    expect(correction?.meta?.perceptual).toBe(true);

    const result = human.applyEvent(correction!);
    expect(result.cancelled).toBe(false);
    expect(human.get("expression.jawOpen")).toBeGreaterThan(0);
  });
});
