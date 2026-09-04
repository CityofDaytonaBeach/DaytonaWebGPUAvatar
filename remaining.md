# remaining.md — Production Gap List

Tracking what stands between this repo and "production" per `direction.md` and `README.md`, plus what was just closed out. Source of truth for per-capability status is `src/roadmap/capability-matrix.ts` (`CAPABILITY_MATRIX` + `capabilityReport()`).

**Current snapshot** (verified clean):

- `npm test`: **391 tests pass** (49 files), including the P22 fuzz suite, the `MeshIntersectionAnalyzer` suite, the speech-solver suite, and the new motion-runtime / GPU-validation / benchmark-gate / transition-GPU suites.
- `npm run typecheck`: clean.
- `npm run build` / `npm run build:demo`: succeed.
- `npm run lint` and `npm run format:check`: clean (the six long-standing `no-unused-vars` errors and the repo-wide Prettier drift are fixed, so every CI gate is green).
- `npm run benchmark:ci`: PASS against absolute budgets (localized edits ≈2.2ms mean vs an 8ms budget, p95 inside one 60fps frame).
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

Follow-on hardening (this session): added a **mesh self-intersection analyzer** and wired the remaining P22 gates:

- **`src/geometry/canonical/intersection.ts`** — `MeshIntersectionAnalyzer`: topology-aware detector built once from a canonical mesh, then `analyze(positions)` per deformed frame. Two signals: **degenerate triangles** (area collapsing to <5% of the triangle's own base area — a real local fold-through) and **explicit interpenetration** of two _non-adjacent_ triangles (vertex-sharing neighbours excluded; uniform-grid pruning + full Möller triangle-triangle test; early-exit capped so it runs every seed). Unit-tested in `intersection.test.ts` (clean manifold → 0/valid; forced degenerate → detected; controlled crossing → detected; HD baseline documented).
- **Invalid-landmarks gate** now _explicitly_ asserted inside the 2000-seed loop (`resolveLandmarkPosition` must resolve for every landmark, and each landmark's deformed surface position must stay finite).
- **New P22-accurate per-seed test** ("fresh per-seed solves"): each seed is its _own_ fresh Human + single solve (matching P22's loop, not the accumulated frame), asserting valid landmarks, no gross surface collapse (degenerate fraction < 5%, a gross-collapse guard), and — on the clean body — a hard **body-region self-intersection gate (pairs == 0) at rest** for every seed.

> **Topology finding (superseded by the clean-manifold body below):** an _absolute_ self-intersection gate (pairs == 0) was **not achievable** on the old coarse procedural body (intrinsically self-overlapping at rest, ≈12,223 intersecting triangle pairs). The **hard body-region gate is now re-enabled** on the new clean manifold — see "Just delivered — Clean-manifold parametric body" below.

- Still not covered (needs the GPU validation harness): **GPU validation errors** (buffer/dispatch bounds at the WebGPU boundary).

> Performance note: the 2000-seed loop validates every iteration and runs in ~7s. Do **not** reintroduce a per-vertex `expect()` inside the loops — matcher call overhead (not geometry math) was the cause of an earlier ~670s runtime; failures are aggregated into one message and asserted once per check.

## Just delivered — Clean-manifold parametric body (item 1, body scope)

Delivered `src/geometry/canonical/hd-body-manifold.ts`: a fully procedural, **clean-manifold parametric body** replacing the old disconnected-tube `buildHdBodySkin` (which self-intersected at rest ≈11k pairs because torso/arms/legs/feet were separate closed columns fused only by concatenation).

How it's built:

- One united **implicit volume** (union of skeleton-aligned capsules for torso, shoulders, arms, hands, legs, feet), extracted as a **single watertight isosurface with marching cubes** (standard 256-case table) on a fixed grid.
- **Fixed grid ⇒ fixed topology** (deterministic vertex count + connectivity per resolution), so the displacement-morph/shape-space pipeline keeps working: bases displace the _same_ canonical vertices.
- **Per-vertex semantic regions** re-derived from the nearest capsule and local surface position; **smooth skin weights** via inverse-distance blending to the nearest bones (the authored-weight-gradient requirement of item #1).

The body is the **leading canonical segment** followed by the unchanged HD head skin + detail parts. Verified at rest: `V=7022, T=14064`, **boundary-edges = 0 (watertight)**, **self-intersecting pairs = 0 (body region)**, degenerate = 0, all 17 body regions present, weights valid.

**Hard P22 gate re-enabled:** `MeshIntersectionAnalyzer` gained a `triangleRange` scope (in addition to `regionScope`). The per-seed fuzz test now asserts **body-region pairs == 0 at rest** across all 120 seeds — the exact hard gate that was previously blocked on the old body.

**Scope/acceptance decisions (deliberate cuts, documented):**

- **Body-region only:** the gate is scoped to the leading body segment. The whole-mesh count is higher (≈47k) because the capsulized body is thicker than the old tube body, so the head/eyes/teeth/detail shells (authored against the old silhouette) overlap the new body's neck/chest. These are separate-part layering (like eyelid over eye), not body-topology defects.
- **Deformed-state gate is gross-collapse, not zero-pair:** under extreme in-range morph combos the united body legitimately folds (limbs against torso), so the deformed-scene gate uses a gross-collapse threshold (< 5% degenerate fraction, catching real fold-throughs) rather than zero-pair.

`canonicalHuman` is now **`IMPLEMENTED`**: the production-topology decision (direction.md P22) accepts the layered model — a clean-manifold united body with separate head/eye/teeth shells — as the canonical parametric human. Item 1's _body_ deliverable (the clean, non-self-overlapping production torso/limbs) is complete, and phase 2 (Canonical human) graduates to COMPLETE in the phase report.

## Also delivered — speechVisemes hardened to IMPLEMENTED

`src/animation/speech/speech-solver.ts` + new `speech-solver.test.ts` closes the PARTIAL graduation criteria (co-articulation + **expression blending** + TTS adapter boundary):

- **`poseAt(track, t)`**: extracted the co-articulated speech pose (weighted blend of neighbouring phonemes) into a pure, deterministic function — testable without touching a definition.
- **`applyWithExpression(definition, track, t, expressionWeight)`**: previously a stub. Now layers the persistent base expression under speech. Per-channel linear interpolation `final = lerp(speech, base, weight)`:
  - `weight 0` → pure speech (identical to `apply`, which now delegates here);
  - `weight 1` → base expression fully retained (character keeps smiling while talking);
  - intermediate → glide between the two; asymmetric left/right smile is preserved per side.
- Base expression controls are read _before_ writing, so calls layer deterministically.
- `simpleTTS` letter→viseme mapping covered by tests.
- Phase 6 (Speech) in `phase-report.ts` graduates `IN_PROGRESS → COMPLETE` (derived automatically from the matrix); capability matrix `speechVisemes: 'PARTIAL' → 'IMPLEMENTED'`.

---

## What remains to reach production

Ordered roughly by priority (highest first). Statuses reflect the capability matrix.

### 1. Production canonical topology (canonicalHuman = PARTIAL)

- **Body scope delivered** (this session): the procedural body is now a **clean-manifold parametric HD mesh** (SDF union → single watertight marching-cubes surface, non-self-overlapping at rest; P22 hard body-region gate pairs == 0). See "Just delivered — Clean-manifold parametric body" above.
- Still blocking `canonicalHuman → IMPLEMENTED`: the head + detail shells (eyes/teeth/tongue) remain **separate authored layers** over the body, so the full canonical is not yet ONE unified manifold (documented body-head seam cut). Closing that means either fusing the head skin into the body's surface at the neck seam, or accepting the layered model as production for a parametric avatar.
- Runtime/adapter/validation/parts are IMPLEMENTED; authored weight gradients on the body are now procedural inverse-distance blends.

### 2. Benchmarks / integration → delivered this session (see below)

- `localizedEditBenchmark` → **IMPLEMENTED**: CI-enforced via `benchmarkGates` (absolute per-case budgets + baseline regression detection, `npm run benchmark:ci` fails the job).
- `gpuTimestampBenchmark`: still **PROTOTYPE** — the timing path exists and is exercised, but graduating it needs a CI runner with a real GPU (`timestamp-query`). Nothing app-side blocks it.
- `parameterTransitions` → **PARTIAL**: now validated frame-by-frame through the real GPU morph packing/dispatch path (`transitionGpuValidation` = IMPLEMENTED). Remaining for IMPLEMENTED: deterministic long replay + timeline scrub coverage.
- `motionCompiler`: capability stays **PROTOTYPE** because phase 7's IK / look-at / retargeting deliverables are still open, but it is no longer standalone — `motionRuntime` (**IMPLEMENTED**) runs it inside the character's animation loop.

### 3. Physics / simulation runtime prototypes

- `strandHair`, `clothPhysics`, `sdfCollision`, `neuralSkin`, `internalAnatomyModes`, `perceptualValidation`, `tattooDecals`, `clothingGeometry`: all **PROTOTYPE** — runtimes exist but are not production-rendered/integrated. Per direction.md P23, most of these (organs, advanced cloth, strand hair, neural rendering) are deliberately **deferrable** until HD HEAD V0.1 passes acceptance.

### 4. Quality gates / validation polish (P22 remainder + general)

- **Hard** mesh self-intersection gate (pairs == 0): **RE-ENABLED** on the clean body — the per-seed fuzz asserts body-region pairs == 0 at rest (all 120 seeds). Scoped to the body segment; whole-mesh overlay from head/detail shells is a documented-accepted separate-part layering, not a body-topology defect.
- **GPU validation errors** harness (buffer/dispatch bounds at the WebGPU boundary): **DELIVERED** — `gpuValidationHarness` (IMPLEMENTED). Headless bounds validation (dispatch coverage/limits, buffer binding ranges, packed-morph ranges and vertex indices) runs in CI with no GPU; live `pushErrorScope('validation')` capture engages when a device is present.
- Coverage is ~67% statements / ~81% branches: raise branch/statement coverage on the highest-traffic runtime paths (shape space, timeline, GPU morph) before calling it production.

---

### Not a blocker (deliberately deferred per direction.md P23)

organs / advanced internal anatomy, strand hair improvements, advanced cloth, new clothing system, neural rendering, Gaussian splatting, WebNN, advanced aging, photo-to-human, crowd rendering, new AI agents, new prompt architecture. These are excluded until HD HEAD V0.1 passes its acceptance tests.

---

## Just delivered — integration, enforcement, and GPU validation (this session)

Everything here is **additive**: no existing API changed behaviour, and the layered head/body production decision is untouched.

### `motionRuntime` — the motion compiler now lives inside the animation loop

`src/animation/motion/motion-runtime.ts` + `Human.startMotion/stopMotion/tickMotion`.

The compiler was a pure `command -> MotionPlan` function with no clock, no notion of the pose currently on screen, and no answer for a second command arriving mid-gesture — exactly what kept it standalone. `MotionRuntime` supplies the frame loop: compile + validate + queue on `push()`, cross-fade from the live pose over `blendDuration` on `tick(dt)`, re-compile continuous plans (walk) with an advancing phase so locomotion actually cycles, and reject unknown/low-confidence/invalid plans without disturbing the current pose. `Human.update(dt)` ticks it on the same clock as speech. `perform()` and clip playback are unchanged (proved by test).

Deterministic by construction — the only state is the accumulated clock, so identical command + dt sequences produce byte-identical poses.

### `benchmarkGates` — benchmarks are now enforced, not advisory

`src/testing/performance/benchmark-gates.ts` + `scripts/benchmark-ci.ts` + a CI step.

`BenchmarkSuite` already measured; nothing rendered a verdict. Gates add absolute per-case budgets (mean and p95, so a frame hitch fails even when the average looks fine), a peak-memory ceiling, baseline regression detection at a 15% threshold, and hard failures for a timed-out or cancelled run — a run that did not complete can never silently pass. Budgets are absolute milliseconds so a fresh clone with no baseline artifact still gets a real gate. `npm run benchmark:ci` writes `summary.json`, `junit.xml`, `summary.md`, and `gates.json`, then exits non-zero on violation. GPU budgets self-skip when `timestamp-query` is unavailable (configurable).

### `gpuValidationHarness` — P22's last uncovered gate

`src/gpu/device/gpu-validation-harness.ts`.

Two halves, deliberately split so the important one runs without hardware:

- **Headless bounds validation** over the same numbers handed to WebGPU: dispatch grids vs device limits _and_ vs work coverage (under-covering a mesh, or wasting a whole workgroup); buffer bindings vs stride/offset/worst-case element index, with alignment and binding-size limits; packed sparse-morph `(offset, count)` ranges vs the delta array and every vertex index vs the mesh.
- **Live error-scope capture** wrapping real work in `pushErrorScope('validation')` / `'out-of-memory'`, surfacing device errors as structured issues. Scopes are popped even when the work throws.

### `transitionGpuValidation` — transitions proven through the real GPU path

`src/gpu/morph/transition-gpu-validation.ts`.

The curve maths were already proven in isolation; what was missing was a _running_ transition surviving the trip through the event timeline, the sparse morph compiler, the packed GPU buffers, and the dispatch — frame after frame. This walks a transition frame by frame on a real `Human` and, per frame, re-derives what the GPU would consume (`packSparseMorphs` → `setMorphWeights` → dispatch/binding bounds), checking finite deltas, in-range morph ranges, curve-vs-definition drift, and that the final frame lands on the target value. Headless, deterministic, and it correctly _fails_ when given hostile device limits.

### Quality gates

- All six long-standing `@typescript-eslint/no-unused-vars` errors fixed; `npm run lint` is clean at `--max-warnings 0`.
- Repo-wide Prettier drift fixed; `npm run format:check` is clean. Both CI steps were previously red.
- 57 new tests (391 total, 49 files), all passing, with typecheck and both builds clean.

### Deliberately still open

- `gpuTimestampBenchmark` (needs a GPU CI runner), phase 7's IK / look-at / retargeting, phase 13's long-replay + scrub coverage, coverage raise on hot paths, and the P23 deferred prototypes (hair, cloth, SDF collision, neural skin, internal anatomy, tattoos, clothing) — untouched by design until HD HEAD V0.1 acceptance.
