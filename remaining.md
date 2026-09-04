# remaining.md — Production Gap List

Tracking what stands between this repo and "production" per `direction.md` and `README.md`, plus what was just closed out. Source of truth for per-capability status is `src/roadmap/capability-matrix.ts` (`CAPABILITY_MATRIX` + `capabilityReport()`).

**Current snapshot** (verified clean):
- `npm test`: **306 tests pass** (42 files), including the new P22 fuzz suite and the speech-solver suite.
- `npm run typecheck`: clean.
- `npm run build` / `npm run build:demo`: succeed.
- Coverage: ~67% statements, ~81% branches, ~65% functions (from `coverage/index.html`).

---

## Just delivered (P22 randomized fuzzing)

`src/geometry/canonical/hd-fuzz.test.ts` implements **direction.md P22: RANDOMIZED FACE FUZZING** on the real `Human` + `HDCanonicalHumanProvider` + shape-space pipeline. Why this was the top remaining item: P22 is an explicit, self-contained acceptance gate that "catches parameter combinations humans will eventually discover five minutes after release," and it exercises the full production morph path end-to-end.

Three seeded, deterministic tests:

1. **Thousands of combinations** (seeds 1..2000): each seed draws 17 identity + body controls uniformly across their **real descriptor ranges** (read from `PropertyRegistry.require(path).min/max`, the single source of truth — never hardcoded), solves the shape, then validates per P22's checklist:
   - no NaN / Infinity in `morphDelta`, `skinScene`, `skinNormals`, or base buffers;
   - lengths correct (`N*3`), indices in `[0,N)`;
   - **bounded (non-runaway) vertex movement** — bound scales with `global.height`'s legitimate proportional scaling, `|gh/1.78-1|` × ~2.5m cap, floor 0.35m for local controls;
   - anatomy score finite in `[0,1]`;
   - affected-vertex telemetry in range;
   - no engine cancellation of realistic values, exact value retention, `identity.seed` untouched by identity/morph edits.
2. **Exact undo** (P20): 500 combined edits then walk the full timeline back (`historyIndex >= 0`) to byte-identical rest geometry (`<1e-6`).
3. **Creation stability**: 25 freshly built HD humans across seeds with no NaN in base geometry and valid canonical topology.

Not yet covered from P22's checklist (flag for future work, requires a mesh-intersection pass): **self-intersection**, **GPU validation errors**, and a direct **invalid-landmarks** gate (landmark validity is implicitly covered via the finite/valid check, not explicitly asserted).

> Performance note: the 2000-seed loop validates every iteration and runs in ~7s. Do **not** reintroduce a per-vertex `expect()` inside the loops — matcher call overhead (not geometry math) was the cause of an earlier ~670s runtime; failures are aggregated into one message and asserted once per check.

## Also delivered — speechVisemes hardened to IMPLEMENTED

`src/animation/speech/speech-solver.ts` + new `speech-solver.test.ts` closes the PARTIAL graduation criteria (co-articulation + **expression blending** + TTS adapter boundary):

- **`poseAt(track, t)`**: extracted the co-articulated speech pose (weighted blend of neighbouring phonemes) into a pure, deterministic function — testable without touching a definition.
- **`applyWithExpression(definition, track, t, expressionWeight)`**: previously a stub. Now layers the persistent base expression under speech. Per-channel linear interpolation `final = lerp(speech, base, weight)`:
  - `weight 0` → pure speech (identical to `apply`, which now delegates here);
  - `weight 1` → base expression fully retained (character keeps smiling while talking);
  - intermediate → glide between the two; asymmetric left/right smile is preserved per side.
- Base expression controls are read *before* writing, so calls layer deterministically.
- `simpleTTS` letter→viseme mapping covered by tests.
- Phase 6 (Speech) in `phase-report.ts` graduates `IN_PROGRESS → COMPLETE` (derived automatically from the matrix); capability matrix `speechVisemes: 'PARTIAL' → 'IMPLEMENTED'`.

---

## What remains to reach production

Ordered roughly by priority (highest first). Statuses reflect the capability matrix.

### 1. Production canonical topology (canonicalHuman = PARTIAL)
- Direction.md's "Daytona-generated HD human: active; production topology" — the shipped default is still the **procedural block human**, not a production HD canonical mesh.
- Runtime/adapter/validation/parts are IMPLEMENTED; the blocking gap is the **production HD mesh asset + its authored weight gradients** (an art/anatomy generation effort, not pure code).
- Once a production topology ships, flip `canonicalHuman` to `IMPLEMENTED` in the matrix.

### 2. Benchmarks → production-shaped (PROTOTYPE)
- `localizedEditBenchmark`, `gpuTimestampBenchmark`: deterministic runtimes exist but lack integrated benchmarks/CI enforcement.
- `parameterTransitions` (timeline interpolation): prototype; needs validation in the GPU path.
- `motionCompiler`: prototype; needs integration into the animation path.

### 3. Physics / simulation runtime prototypes
- `strandHair`, `clothPhysics`, `sdfCollision`, `neuralSkin`, `internalAnatomyModes`, `perceptualValidation`, `tattooDecals`, `clothingGeometry`: all **PROTOTYPE** — runtimes exist but are not production-rendered/integrated. Per direction.md P23, most of these (organs, advanced cloth, strand hair, neural rendering) are deliberately **deferrable** until HD HEAD V0.1 passes acceptance.

### 4. Quality gates / validation polish (P22 remainder + general)
- Mesh **self-intersection** detection under randomized deformation (needs a topology-aware intersection pass).
- Explicit **invalid-landmarks** assertion in the fuzz suite.
- Coverage is ~67% statements / ~81% branches: raise branch/statement coverage on the highest-traffic runtime paths (shape space, timeline, GPU morph) before calling it production.

---

### Not a blocker (deliberately deferred per direction.md P23)
organs / advanced internal anatomy, strand hair improvements, advanced cloth, new clothing system, neural rendering, Gaussian splatting, WebNN, advanced aging, photo-to-human, crowd rendering, new AI agents, new prompt architecture. These are excluded until HD HEAD V0.1 passes its acceptance tests.
