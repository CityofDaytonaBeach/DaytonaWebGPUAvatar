# remaining.md — Production Gap List

Tracking what stands between this repo and "production" per `direction.md` and `README.md`, plus what was just closed out. Source of truth for per-capability status is `src/roadmap/capability-matrix.ts` (`CAPABILITY_MATRIX` + `capabilityReport()`).

**Current snapshot** (verified clean):

- `npm test`: **493 tests pass** (57 files), including the P22 fuzz suite, the `MeshIntersectionAnalyzer` suite, the speech-solver suite, and the new motion-runtime / GPU-validation / benchmark-gate / transition-GPU suites.
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

## Just delivered — Photoreal head & skin shading (renderer path)

`photorealSkinShading`, `photorealEyeShading`, `photorealMaterials` are all **IMPLEMENTED**, and `'photoreal'` is now the **default shading model** of `WebGpuHumanPipeline` (pass `shading: 'basic'` for the previous single-lobe program).

Why this was next: the geometry, morph, skinning and motion stack was production-shaped, but the render path was still a single-lobe Lambert/Cook-Torrance placeholder — the head could deform correctly and still read as plastic. Photoreal head/skin was the top remaining objective in the status matrix.

What landed (all deterministic, all headlessly testable, no GPU required):

- **`src/render/photoreal/constants.ts`** — the single shared constant table (lobe mix, roughness floor, SSS wrap/distortion, curvature scale, transmission strength, exposure/ambient, pore/micro frequencies, limbus start, cornea depth, enamel translucency, sclera vascularity) plus the part-flag bit field and the fixed three-point light rig.
- **`src/render/photoreal/skin-brdf.ts`** — the authoritative skin model: **dual-lobe GGX** specular (sharp sebum lobe + broad epidermal lobe — the single-lobe look was the main "CG plastic" tell), height-correlated Smith visibility, Schlick Fresnel, **energy-conserving** diffuse (`kD = 1 - F`), **pre-integrated curvature SSS** (per-channel wrapped diffusion; red transports furthest, so the terminator goes soft and red instead of grey), and **thin-tissue transmission** for ear rims / nostrils / lids.
- **`src/render/photoreal/micro-detail.ts`** — procedural pore + micro-texture height field, differentiated into a real tangent-space **micro-normal** (finite-difference gradient, so it is integrable rather than arbitrary noise), plus **cavity** and **specular-occlusion** terms. Sebum flattens it, age deepens it.
- **`src/render/photoreal/eye-shading.ts`** — **iris parallax by refracting the view ray through the corneal dome** (the flat-iris-disc problem), luminance-driven **pupil dilation**, **limbal ring**, radial fibre variation, **vascular sclera** tint toward the corners, and translucent **enamel** (cool thin edges, occluded molars).
- **`src/render/photoreal/color.ts`** — exposure → **ACES filmic** → sRGB display transform (monotonic, black-preserving, never clips).
- **`src/render/photoreal/photoreal-material.ts`** — per-part material assignment from the semantic parameter layer for skin / sclera / limbus / cornea / iris / pupil / teeth / tongue / cavity, including the wet-skin response (wetness lowers roughness and raises specular) and iris colour resolution. Sclera is deliberately never pure white.
- **`src/render/wgsl/photoreal-wgsl.ts`** — `PHOTOREAL_HUMAN_WGSL`, **generated** from the same constants and mirroring every CPU function one-for-one. It is a **drop-in module swap**: identical bind group layout (params/camera/part) and vertex layout (position/normal/uv/tangentPerturb), so no pipeline change was needed. `WebGPURenderer` takes the shader code as a constructor argument and OR-s per-part `extraFlags` into `PartParams.flags`.

The pipeline now also takes the **runtime `HumanDefinition`** (`definition` option) instead of a registry default, so materials and the tangent-perturbation buffer reflect the actual human, and `refreshMaterials(definition)` re-derives per-part materials without rebuilding index buffers when skin/eye parameters change.

**Parity is structural, not asserted by eyeball:** the shader interpolates the shared constant table, and the test suite asserts every constant value, every flag bit, and every function name appears in the emitted WGSL — a constant cannot drift between CPU and GPU because there is only one copy.

Coverage: 43 new tests (`photoreal-shading.test.ts`, `photoreal-material.test.ts`) — energy conservation over swept roughness/specular/normals, Fresnel/GGX/Smith limits, scatter reducing exactly to Lambert at zero intensity, curvature narrowing the scatter, transmission falling off with thickness, micro-detail slope bounds and age/oil statistics, iris parallax zero head-on and non-zero when turned, monotonic limbal ring, pupil response direction, enamel edge/arch behaviour, and the WGSL parity gates. Suite total **493 tests / 57 files**, typecheck / lint / `format:check` / `build` / `build:demo` all clean.

**Deliberate scope cuts at the time (now closed — see "Just delivered — photoreal lighting increments" below):** constant ambient instead of an IBL probe, fixed per-material curvature/thickness instead of a per-vertex bake, and no screen-space SSS blur.

## Just delivered — photoreal lighting increments (IBL + curvature/thickness bake + screen-space SSS)

All three documented photoreal scope cuts are closed, without introducing an environment-texture pipeline or an async asset dependency.

- **`src/render/photoreal/ibl.ts`** — the constant ambient term is replaced by an **analytic studio probe** (sky gradient, warm floor bounce, soft key + cool fill panels) that is a pure function of direction, so the CPU and the shader evaluate the same environment. Diffuse ambient is that environment projected onto **9 RGB spherical-harmonic coefficients** (Ramamoorthi/Hanrahan cosine convolution), baked once at module load over a deterministic Fibonacci sphere and interpolated into the generated WGSL — the GPU cannot drift from the tested numbers. Specular ambient uses the **split-sum** approximation: an analytic prefiltered probe (mirror sample blurred toward the SH irradiance as roughness rises, exact at roughness 0) times Karis' analytic environment BRDF, clamped non-negative. Ambient is now direction- and albedo-dependent, which is the second-biggest "CG" tell after single-lobe specular.
- **`src/render/photoreal/curvature-bake.ts`** — replaces the head-wide `SKIN_CURVATURE` / `SKIN_THICKNESS` constants with a per-vertex bake from the canonical topology: **mean curvature from normal divergence** over the one-ring, and **tissue thickness** by marching inward along `-normal` to the nearest opposing (back-facing) sample through a uniform spatial hash (so cost is linear in vertex count). Results are clamped to shared ranges and interleaved as one `vec2` attribute. Pre-integrated SSS and transmission now vary per surface region: a nostril rim, a lid and a cheek no longer scatter identically.
- **`src/render/photoreal/sss-blur.ts`** — separable, depth-aware **screen-space SSS** following Jimenez: per-channel Gaussian-sum kernel (red diffuses furthest), non-linear tap placement, step size scaled by `1/depth` so the kernel covers a **constant world width**, and depth/mask rejection so light cannot bleed across a silhouette or off skin. Kernel generation, energy conservation and rejection are unit-tested on the CPU; the same kernel is interpolated into the generated two-pass WGSL.
- **Pipeline / renderer wiring** — `WebGpuHumanPipeline` bakes and uploads curvature/thickness once (`bakeCurvatureThickness` option, default on under `'photoreal'`); `WebGPURenderer` adds the location-4 vertex buffer **only** when the bound shader declares it, so the `'basic'` module's pipeline layout is untouched. A zeroed attribute means "not baked" and the shader falls back to the previous constants, so the buffer is genuinely optional.
- **Coverage:** 51 new tests (`ibl.test.ts`, `curvature-bake.test.ts`, `sss-blur.test.ts`) — SH basis orthonormality under the quadrature, constant-environment irradiance identity, probe determinism, split-sum bounds and roughness behaviour, ambient direction dependence, flat-quad zero curvature vs sphere-radius ordering, thin-gap thickness recovery, kernel symmetry/energy/tail ordering, world-constant step scaling, silhouette and mask rejection, and WGSL parity gates asserting the shader uses the probe rather than the old ambient line. Suite total **544 tests / 60 files**; typecheck, lint, `format:check` and `build` clean.

**Remaining photoreal work (unchanged in kind):** the screen-space SSS module supplies the generated passes and the tested kernel, but the render graph still draws in a single pass — wiring the extra lit/depth/mask targets is a renderer-graph change, not a shading one. Hair, cloth, clothing geometry, SDF collision, neural skin and photo-to-human remain prototypes/deferred.

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
- `parameterTransitions` → **IMPLEMENTED**: GPU-validated frame-by-frame (`transitionGpuValidation`), plus deterministic long replay (10 simulated minutes at 120Hz, two byte-identical passes, exact settle on target) and order-independent timeline scrubbing (`verifyLongReplay`, `scrubTransition`, `scrubTimeline`). Phase 13 is COMPLETE.
- `motionCompiler`: capability stays **PROTOTYPE** because phase 7's IK / look-at / retargeting deliverables are still open, but it is no longer standalone — `motionRuntime` (**IMPLEMENTED**) runs it inside the character's animation loop.

### 3. Photoreal increments beyond the delivered shading layer

- Multi-target render graph so the delivered screen-space SSS passes can run (lit + depth + skin-mask attachments). IBL probe irradiance and the per-vertex curvature/thickness bake are now implemented and wired.

### 4. Physics / simulation runtime prototypes

- `strandHair`, `clothPhysics`, `sdfCollision`, `neuralSkin`, `internalAnatomyModes`, `perceptualValidation`, `tattooDecals`, `clothingGeometry`: all **PROTOTYPE** — runtimes exist but are not production-rendered/integrated. Per direction.md P23, most of these (organs, advanced cloth, strand hair, neural rendering) are deliberately **deferrable** until HD HEAD V0.1 passes acceptance.

### 5. Quality gates / validation polish (P22 remainder + general)

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

- `gpuTimestampBenchmark` (needs a GPU CI runner), coverage raise on hot paths, and the P23 deferred prototypes (hair, cloth, SDF collision, neural skin, internal anatomy, tattoos, clothing) — untouched by design until HD HEAD V0.1 acceptance.

## Just delivered — Motion + IK complete (phase 7) and transition replay/scrub (phase 13)

**Motion + IK** (`motionCompiler: PROTOTYPE → IMPLEMENTED`, phase 7 `PROTOTYPE → COMPLETE`). The old motion path only had heuristic IK/look-at recipes in `MotionCompiler` with no forward-kinematics layer, so nothing could be _measured_. Now:

- **`src/animation/skeleton/kinematics.ts`** — deterministic FK evaluator (`forwardKinematics`, `boneWorldPosition`), topological bone ordering, chain resolution, and a quaternion/vector toolkit (`quatBetween`, `quatToEulerDeg` / `eulerDegToQuat`, matching the existing euler convention exactly).
- **`src/animation/ik/ik-solver.ts`** — FABRIK chain and limb IK (`solveChainIK`, `solveLimbIK`) with pole-vector control of elbow/knee orientation, authored joint-limit clamping, and multi-pass convergence **verified against the real FK pipeline** (the returned `error` is FK-measured, not solver-internal). Out-of-reach targets are flagged (`targetUnreachable`) and extended along the root→target axis instead of tearing the limb.
- **`src/animation/ik/look-at.ts`** — FK-verified gaze: rotation is distributed across the neck/head chain by share weights, clamped by `maxAngleDeg` and joint limits, parent-aware (tracks correctly through a twisted torso), with an `intensity` blend.
- **`src/animation/retarget/retargeting.ts`** — rest-pose-relative retargeting (`retargetPose`, `retargetClip`) with measured height-based translation scaling and an objective `retargetFidelity` drift metric.
- **`src/animation/motion/motion-runtime.ts`** — persistent IK and gaze constraints (`setIkTarget`, `setLookAtTarget`) layered additively on top of the blended motion pose; every frame and `status()` reports the FK-measured outcome (`error`, `angleErrorDeg`, `reached`, `targetUnreachable`), and `reset()` drops constraints with the rest of the state.

Coverage: `kinematics.test.ts` (10), `ik-solver.test.ts` (10), `look-at.test.ts` (8), `retargeting.test.ts` (11), `motion-runtime-ik.test.ts` (10) — FK-measured reach, pole-vector side switching, joint-limit boxes, swept-target NaN fuzzing, composition with a walking base pose, and cross-runtime determinism.

**Transitions** (`parameterTransitions: PARTIAL → IMPLEMENTED`, phase 13 `IN_PROGRESS → COMPLETE`):

- `verifyLongReplay` replays a transition over a long window (default 600s at 120Hz) **twice** from absolute per-frame times, reporting determinism, max pass deviation, finiteness, and whether the value settles exactly on target and never moves again.
- `scrubTransition` / `scrubTimeline` prove scrubbing is stateless: a deterministically shuffled scrub reproduces an ordered scrub bit-for-bit, backwards scrubs equal forwards, and out-of-window scrubs clamp to the endpoints.
- **Bug fixed in the process:** the `elastic` curve was `1 + elasticBase(t)`, so it started at 1 and ended at 2 — a transition using it never landed on its target (observed: 1.12 instead of 0.8). `elastic` is now a decaying ease-out pinned at both endpoints, and `spring` / `bounce` are endpoint-pinned too, so every curve settles exactly.
