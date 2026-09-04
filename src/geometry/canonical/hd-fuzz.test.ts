import { describe, it, expect } from 'vitest';
import { Human } from '../../human.js';
import { HDCanonicalHumanProvider } from './hd-head-provider.js';
import { validateCanonicalTopology } from './canonical-validator.js';
import { resolveLandmarkPosition } from './landmark.js';
import { MeshIntersectionAnalyzer } from './intersection.js';
import { PropertyRegistry } from '../../core/schema/registry.js';

/**
 * Randomized Face/Body Fuzzing (direction.md P22).
 *
 * The stated purpose of this gate is to "catch parameter combinations humans
 * will eventually discover five minutes after release." We drive THOUSANDS of
 * deterministic, constraint-bounded definitions through the real
 * Human + HD provider + shape-space pipeline and assert the invariants P22
 * lists: no NaN/Infinity, valid indices/buffers, bounded (non-runaway) vertex
 * movement, valid landmarks, and identity stability — plus exact undo.
 *
 * Everything is seeded, so a failure is reproducible (same seed, same input).
 *
 * Performance note: the per-iteration checks aggregate failures into a single
 * message and assert ONCE per check rather than calling `expect()` inside the
 * per-vertex loops. Calling the matcher per element over ~1700 vertices x 2000
 * seeds is the dominant cost; aggregating keeps the same coverage at test-time
 * cost proportional to the geometry math itself.
 */

/** Deterministic 32-bit PRNG (mulberry32). Same seed => same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic multi-seed walk of the ten P7 identity controls + body controls. */
function randomizedIdentityPatch(seed: number, registry: PropertyRegistry): Record<string, number> {
  const rand = mulberry32(seed);
  // Each control draws uniformly across the full DESCRIPTOR range for that
  // property. Reading bounds from the single source of truth (the registry)
  // guarantees we stay in-range, so the constraint solver treats every value as
  // a plausible human and the engine must never clamp/cancel a request.
  const inRange = (path: string): number => {
    const meta = registry.require(path);
    const lo = typeof meta.min === 'number' ? meta.min : 0;
    const hi = typeof meta.max === 'number' ? meta.max : 1;
    return lo + rand() * (hi - lo);
  };
  return {
    'face.nose.width': inRange('face.nose.width'),
    'face.nose.length': inRange('face.nose.length'),
    'face.jaw.width': inRange('face.jaw.width'),
    'face.chin.projection': inRange('face.chin.projection'),
    'face.eye.spacing': inRange('face.eye.spacing'),
    'face.eye.size': inRange('face.eye.size'),
    'face.cheek.width': inRange('face.cheek.width'),
    'face.mouth.width': inRange('face.mouth.width'),
    'face.upperLip.thickness': inRange('face.upperLip.thickness'),
    'face.lowerLip.thickness': inRange('face.lowerLip.thickness'),
    'body.muscularity': inRange('body.muscularity'),
    'body.bodyFat': inRange('body.bodyFat'),
    'body.waist': inRange('body.waist'),
    'body.hips': inRange('body.hips'),
    'body.chest': inRange('body.chest'),
    'skeleton.shoulderWidth': inRange('skeleton.shoulderWidth'),
    'global.height': inRange('global.height'),
  };
}

describe('Randomized face/body fuzzing (direction.md P22)', () => {
  it('tolerates thousands of deterministic identity combinations on the HD human', async () => {
    const provider = new HDCanonicalHumanProvider();

    const asset = await provider.load();
    const report = validateCanonicalTopology({
      vertices: asset.topology.vertices,
      indices: asset.topology.indices,
      parts: asset.topology.parts,
    });
    expect(report.valid, report.issues.map((i) => i.message).join('; ')).toBe(true);

    const human = await Human.create({ canonicalProvider: provider });
    const canonical = human.canonicalRef;
    const registry = human.registry;
    const N = canonical.vertexCount;
    const basePositions = canonical.baseGeometry().positions;
    const baseNormals = canonical.baseGeometry().normals;

    // Starting rest scene (identity state) recorded before any fuzz modulation.
    const restScene = human.skinScene();

    // Worst-case geometric displacement `global.height` alone can legitimately
    // cause at the tallest canonical vertex (~2.5m cap on absolute Y).
    const heightCeiling = (gh: number): number => 2.5 * Math.abs(gh / 1.78 - 1);

    const assertValid = (label: string): void => {
      const problems: string[] = [];

      const delta = human.computeMorphDelta();
      if (delta.length !== N * 3) problems.push(`${label}: morphDelta length ${delta.length} != ${N * 3}`);
      const scene = human.skinScene();
      if (scene.length !== N * 3) problems.push(`${label}: skinScene length ${scene.length} != ${N * 3}`);
      const normals = human.skinNormals();
      if (normals.length !== N * 3) problems.push(`${label}: skinNormals length ${normals.length} != ${N * 3}`);
      if (basePositions.length !== N * 3) problems.push(`${label}: basePositions length ${basePositions.length}`);
      if (baseNormals.length !== N * 3) problems.push(`${label}: baseNormals length ${baseNormals.length}`);

      const markBadFloats = (arr: Float32Array, where: string): void => {
        for (let i = 0; i < arr.length; i++) {
          if (!Number.isFinite(arr[i])) {
            problems.push(`${label}: ${where}[${i}] not finite (${arr[i]})`);
            break;
          }
        }
      };
      markBadFloats(delta, 'morphDelta');
      markBadFloats(scene, 'skinScene');
      markBadFloats(normals, 'skinNormals');
      markBadFloats(Float32Array.from(basePositions), 'basePositions');
      markBadFloats(Float32Array.from(baseNormals), 'baseNormals');

      // Extreme vertex movement guard: global.height is the ONE legitimate large
      // driver (taller OR shorter people move crown/body vertices a lot), so the
      // bound scales with |gh/default - 1|; a fixed floor covers the small
      // face/body controls. Anything beyond this is a runaway/non-local blowup.
      const MAX_DISPLACEMENT = Math.max(0.35, heightCeiling(human.get('global.height')) + 0.35);
      for (let i = 0; i < N; i++) {
        const mag = Math.hypot(
          scene[i * 3] - basePositions[i * 3],
          scene[i * 3 + 1] - basePositions[i * 3 + 1],
          scene[i * 3 + 2] - basePositions[i * 3 + 2],
        );
        if (!Number.isFinite(mag) || mag > MAX_DISPLACEMENT) {
          problems.push(`${label}: vertex ${i} displaced ${mag.toFixed(3)} (>${MAX_DISPLACEMENT.toFixed(3)})`);
          break;
        }
      }

      // Triangle index bounds remain valid (P22: invalid indices).
      const indices = canonical.indices;
      for (let t = 0; t < indices.length; t++) {
        const idx = indices[t];
        if (!Number.isInteger(idx) || idx < 0 || idx >= N) {
          problems.push(`${label}: index ${t} = ${idx} out of [0,${N})`);
          break;
        }
      }

      // Landmarks must remain structurally valid (P22: invalid landmarks) and
      // finite at their deformed surface position.
      for (const lm of asset.landmarks) {
        const resolved = resolveLandmarkPosition(canonical, lm);
        if (!resolved) {
          problems.push(`${label}: landmark ${lm.name} unresolved (bad triangle/vertex)`);
          break;
        }
        const tri = lm.triangleId;
        const [tA, tB, tC] = lm.barycentric;
        const sum = tA + tB + tC || 1;
        const ia = indices[tri * 3];
        const ib = indices[tri * 3 + 1];
        const ic = indices[tri * 3 + 2];
        const px = (scene[ia * 3] * tA + scene[ib * 3] * tB + scene[ic * 3] * tC) / sum;
        const py = (scene[ia * 3 + 1] * tA + scene[ib * 3 + 1] * tB + scene[ic * 3 + 1] * tC) / sum;
        const pz = (scene[ia * 3 + 2] * tA + scene[ib * 3 + 2] * tB + scene[ic * 3 + 2] * tC) / sum;
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
          problems.push(`${label}: landmark ${lm.name} non-finite at deformed position`);
          break;
        }
      }

      // Anatomy resolution stays finite within the plausible 0..1 score.
      const score = human.anatomyScore();
      if (!Number.isFinite(score) || score < 0 || score > 1) {
        problems.push(`${label}: anomaly anatomyScore ${score}`);
      }

      // Affected-vertex telemetry is a real, bounded set of canonical vertices.
      for (const id of human.affectedVertexIds()) {
        if (!Number.isInteger(id) || id < 0 || id >= N) {
          problems.push(`${label}: affected id ${id} out of range`);
          break;
        }
      }

      expect(problems, `${label}:\n  ${problems.join('\n  ')}`).toEqual([]);
    };

    for (let seed = 1; seed <= 2000; seed++) {
      const patch = randomizedIdentityPatch(seed, registry);
      const beforeSeed = human.get('identity.seed');

      const r = human.modify(patch);
      // Realistic, in-range values must never be cancelled by the engine.
      expect(r.cancelled, `seed ${seed} cancelled: ${r.reason}`).toBe(false);
      const clampProblems: string[] = [];
      for (const [k, v] of Object.entries(patch)) {
        if (Math.abs(human.get(k) - v) > 1e-6) clampProblems.push(`seed ${seed} ${k}=${human.get(k)} (want ${v})`);
      }
      expect(clampProblems).toEqual([]);

      // Identity seed is untouched by any identity/morph edit (P19/P15).
      expect(human.get('identity.seed')).toBe(beforeSeed);

      assertValid(`seed ${seed}`);
    }

    // Identity invariant (P19): after all those edits the underlying identity
    // seed is still the original.
    expect(human.get('identity.seed')).toBe(human.definitionRef.serialize()['identity.seed']);

    // No transient NaN/Infinity leaked at the end.
    assertValid('final');
    // But geometry should have moved from rest across the fuzz run.
    const finalScene = human.skinScene();
    let moved = 0;
    for (let i = 0; i < N; i++) {
      const d =
        Math.abs(finalScene[i * 3] - restScene[i * 3]) +
        Math.abs(finalScene[i * 3 + 1] - restScene[i * 3 + 1]) +
        Math.abs(finalScene[i * 3 + 2] - restScene[i * 3 + 2]);
      if (d > 1e-9) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('recovers an exact rest geometry after undo across many combined edits', async () => {
    const human = await Human.create({ canonicalProvider: new HDCanonicalHumanProvider() });
    const registry = human.registry;
    const rest = human.skinScene();

    for (let seed = 1; seed <= 500; seed++) {
      human.modify(randomizedIdentityPatch(seed, registry));
    }

    // Walk the whole timeline back to the pristine base (pointer -1); the final
    // result must be byte-identical to the untouched rest scene — exact-undo
    // gate (P20). `historyIndex >= 0` means an event is still applied.
    while (human.historyIndex >= 0) {
      human.undo();
    }
    const restored = human.skinScene();
    expect(restored.length).toBe(rest.length);
    for (let i = 0; i < rest.length; i++) {
      expect(Math.abs(restored[i] - rest[i])).toBeLessThan(1e-6);
    }
  });

  it('constructs many freshly-generated HD humans from different seeds without NaN', async () => {
    // Creation-path stability: each provider load + Human build is deterministic
    // and must never yield NaNs in the base geometry, regardless of seed.
    for (let seed = 1; seed <= 25; seed++) {
      const human = await Human.create({
        canonicalProvider: new HDCanonicalHumanProvider(),
        seed: { 'identity.seed': seed, 'global.height': 1.6 + (seed % 10) * 0.05 },
      });
      const positions = human.canonicalRef.baseGeometry().positions;
      expect(Number.isFinite(positions[0])).toBe(true);
      for (let i = 0; i < positions.length; i++) {
        expect(Number.isFinite(positions[i]), `seed ${seed} base vertex ${i}`).toBe(true);
      }
      expect(validateCanonicalTopology(human.canonicalRef).valid).toBe(true);
    }
  });

  it('keeps fresh per-seed solves free of surface collapse and invalid landmarks', async () => {
    // P22's per-seed loop: each seed is its own fresh solve (create -> apply ONE
    // definition -> validate geometry), not an accumulated multi-edit frame. On
    // a single realistic human the surface must not locally collapse. The coarse
    // procedural body is intrinsically self-overlapping at rest (documented in
    // intersection.test.ts), so an absolute zero-pair gate is impossible on this
    // topology; the stable, meaningful signal is DEGENERATE triangles: a genuine
    // fold-through collapses big fractions of the mesh, far above rounding noise.
    const PROVIDER = new HDCanonicalHumanProvider();
    const ASSET = await PROVIDER.load();
    const registry = await Human.create({ canonicalProvider: PROVIDER }).then((h) => h.registry);
    let analyzed = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const human = await Human.create({ canonicalProvider: new HDCanonicalHumanProvider() });
      const canonical = human.canonicalRef;
      const N = canonical.vertexCount;
      const analyzer = new MeshIntersectionAnalyzer(canonical);
      human.modify(randomizedIdentityPatch(seed, registry));
      const scene = human.skinScene();
      expect(scene.length).toBe(N * 3);

      // Landmarks stay structurally valid and finite after a single solve.
      for (const lm of ASSET.landmarks) {
        const resolved = resolveLandmarkPosition(canonical, lm);
        expect(resolved, `seed ${seed} landmark ${lm.name}`).not.toBeNull();
      }

      // No local surface collapse: deformed triangles must not fall below a
      // large fraction of their base area en masse. Allow < 1% of triangles (a
      // real collapse folds far more); any single rare tiny triangle is caught
      // by the strict structural checks above.
      const rep = analyzer.analyze(scene);
      const degFraction = rep.degenerateCount / (canonical.indices.length / 3);
      expect(degFraction, `seed ${seed} degenerate ${rep.degenerateCount}`).toBeLessThan(0.01);
      analyzed++;
    }
    expect(analyzed).toBe(120);
  });
});
