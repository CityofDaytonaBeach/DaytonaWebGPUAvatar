import { describe, expect, it } from "vitest";
import { Human } from "../../human";
import { createTorsoCloth, simulateCloth, stepCloth } from "./cloth-sim";

describe("cloth simulation prototype", () => {
  it("creates a deterministic pinned torso cloth grid", () => {
    const a = createTorsoCloth(6, 5);
    const b = createTorsoCloth(6, 5);

    expect(a).toEqual(b);
    expect(a.particles).toHaveLength(30);
    expect(a.constraints).toHaveLength((6 - 1) * 5 + (5 - 1) * 6);
    expect(a.particles.filter((p) => p.pinned)).toHaveLength(2);
  });

  it("moves unpinned particles under gravity while preserving pinned anchors", async () => {
    const human = await Human.create();
    const cloth = createTorsoCloth(4, 4);
    const pinnedBefore = cloth.particles.filter((p) => p.pinned).map((p) => ({ ...p.position }));
    const bottomBefore = cloth.particles.at(-1)!.position.y;

    const stepped = stepCloth(cloth, human.sdfField(), { dt: 1 / 30, iterations: 3, collisionPadding: 0 });

    expect(stepped.particles.filter((p) => p.pinned).map((p) => p.position)).toEqual(pinnedBefore);
    expect(stepped.particles.at(-1)!.position.y).toBeLessThan(bottomBefore);
  });

  it("projects cloth particles out of the human SDF collision field", async () => {
    const human = await Human.create();
    const cloth = createTorsoCloth(4, 4);
    for (const p of cloth.particles) {
      if (!p.pinned) {
        p.position.z = 0;
        p.previous.z = 0;
      }
    }

    const simulated = human.simulateCloth(cloth, 4, { dt: 1 / 60, iterations: 6, collisionPadding: 0.01 });
    const minDistance = Math.min(...simulated.particles.filter((p) => !p.pinned).map((p) => human.sdfDistance(p.position)));

    expect(minDistance).toBeGreaterThanOrEqual(0.008);
  });

  it("responds to larger bodies through the same SDF collision path", async () => {
    const lean = await Human.create();
    const large = await Human.create();
    large.modify({ "body.waist": 1.8, "body.bodyFat": 0.6 });
    const cloth = createTorsoCloth(5, 5);

    const leanSim = simulateCloth(cloth, lean.sdfField(), 2, { collisionPadding: 0.01 });
    const largeSim = simulateCloth(cloth, large.sdfField(), 2, { collisionPadding: 0.01 });
    const leanAvgZ = leanSim.particles.reduce((sum, p) => sum + p.position.z, 0) / leanSim.particles.length;
    const largeAvgZ = largeSim.particles.reduce((sum, p) => sum + p.position.z, 0) / largeSim.particles.length;

    expect(largeAvgZ).toBeGreaterThan(leanAvgZ);
  });
});
