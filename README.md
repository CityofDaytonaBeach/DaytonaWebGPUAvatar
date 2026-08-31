# Daytona WebGPU Avatar

A browser-native, GPU-resident, persistent **digital-human runtime** built on WebGPU.

> **The Character is NOT the Mesh.** A character is persistent structured state
> (anatomy, identity, materials, attachments, history, expressions). The visible
> mesh is only one real-time representation *compiled* from that state.

This is the first full SDK milestone implementing the architecture specified in
`start.md` — a schema-compiled Human Definition Language, a semantic dependency
graph, a delta compiler, sparse morphs, identity preservation, an event-sourced
timeline, a GPU buffer/scheduler/profiler layer, a skeletal/facial/speech
animation layer, and a prompt interpreter — all behind one event-driven API.

## Status

Capability matrix (see `CAPABILITY_MATRIX` in `src/index.ts`):

| System | Status |
| --- | --- |
| Human Definition Language + schema compiler | IMPLEMENTED |
| Stable numeric property IDs + GPU buffer layout | IMPLEMENTED |
| Human dependency graph | IMPLEMENTED |
| Human delta compiler | IMPLEMENTED |
| Sparse morph format | IMPLEMENTED |
| GPU sparse-morph compute (WGSL) + deform | IMPLEMENTED |
| GPU-resident rendering (deformed mesh) | IMPLEMENTED |
| Identity preservation solver | IMPLEMENTED |
| Anatomical constraint solver | IMPLEMENTED |
| Constraint profiles (REALISTIC / STYLIZED / FANTASY) | IMPLEMENTED |
| Event-sourced timeline, undo/redo, snapshots | IMPLEMENTED |
| Canonical human (procedural block, replaceable) | PROTOTYPE |
| Canonical human parts (eyes/teeth/tongue/cavity) | IMPLEMENTED |
| Parametric skeleton + joint placement | IMPLEMENTED |
| Parametric anatomy solver (dimensions + constraints) | IMPLEMENTED |
| Bone matrices (FK) + inverse-bind skinning | IMPLEMENTED |
| Skeletal animation (clips/blending) + GPU skinning | IMPLEMENTED |
| Facial expressions + speech visemes | IMPLEMENTED |
| GPU scheduler + dev profiler | IMPLEMENTED |
| Semantic + perceptual LOD | IMPLEMENTED |
| WebGPU renderer + WGSL shaders | IMPLEMENTED |
| Prompt interpreter (patch-based) | IMPLEMENTED |
| WebGL2 fallback, strand hair, cloth, SDF, neural skin | PLANNED |

## Quick start

```bash
npm install
npm run dev        # open the interactive demo
npm test           # run the unit + integration suite
npm run build      # compile the SDK library (dist/)
npm run build:demo # build the demo app (dist-demo/)
```

## The character API

```ts
import { Human } from "daytona-webgpu-avatar";

const human = await Human.create();

human.modify({ "face.nose.width": 0.6 });          // non-destructive, localized
human.setExpression("smile", 1);
human.prompt("make the nose narrower");            // natural language → events
human.speak("hello there");
human.undo(); human.redo();                         // transactional
human.applyEvent(anyEvent);                         // single automation/API path
```

Every mutation flows through **one** `applyEvent` method. The engine (not the AI)
decides what is valid, what is dirty, and which GPU work must recompute.

## Architecture

```
Prompt / UI / API / Automation / Simulation / Motion / Speech / Animation
        │
        ▼
  CharacterEvent  ─────────────────────  single mutation path
        │
        ▼
  HumanDefinition (persistent semantic state)
        │
   IdentitySolver · ConstraintSolver · Timeline
        │
        ▼
  HumanDependencyGraph ──> DeltaCompiler ──> ComputeGraph
        │                                     │
        ▼                                     ▼
  GPU-resident state  ─────────────────  WebGPU compute / render
        │
        ▼
  HD digital human (one compiled representation of the character)
```

Key files:
- `src/core/schema/` — property registry (schema compiler), `HumanDefinition`, IDs
- `src/compiler/dependency/` and `src/compiler/delta/` — dirty regions + delta compiler
- `src/identity/`, `src/constraints/` — identity preservation & anatomical limits
- `src/geometry/` — canonical human, sparse morphs
- `src/gpu/` — buffers, kernels (CPU + WGSL deform), scheduler, profiler, morph packer
- `src/render/` — WebGPU renderer + WGSL shaders (deform + camera), GPU pipeline
- `src/animation/` — skeleton, facial expressions, speech/visemes
- `src/ai/prompt/` — patch-based prompt interpreter
- `src/human.ts` — the orchestrated `Human` class

## Engineering principles

- **Non-destructive**: `"make the nose 5% narrower"` → `{ op: "adjust", path: "anatomy.face.nose.width", multiply: 0.95 }`. Never regenerates the human.
- **Patch-based prompts**: AI emits only changed paths; unrelated identity never drifts.
- **Single source of truth**: one schema generates IDs, GPU offsets, defaults, WGSL layout, and validation — CPU/GPU offsets are tested to match.
- **Deterministic**: same definition + seed + asset package reproduces the same person.
- **GPU-resident**: hot state stays on the GPU; the CPU sends small change events.
- **Locality proved by tests**: a nose edit touches only nose-range vertices and the `SparseMorph` kernel — never hair/cloth/clothing.

## Demo ("Phase 0/1/GPU proof")

The demo (`demo/index.html`) proves the foundational invention:

1. Load one canonical rigged human.
2. Change nose width, jaw width, muscularity via sliders or prompt.
3. The dependency graph + delta compiler report exactly which kernels/regions changed.
4. Undo restores the exact prior state; unrelated systems (hair, identity, expression) stay untouched.
5. The profiler panel shows dirty regions and morph data processed per edit.
6. **GPU path (when WebGPU is available):** morphs are decompressed by a WGSL
   compute kernel (`GpuMorphDeform`) into GPU-resident working positions, then
   drawn by `WebGPURenderer` under a camera; edits visibly deform only the
   affected geometry. Without WebGPU it falls back to the CPU canvas reference.

Run `npm run dev` and open the local URL. A badge reports the active engine.

### GPU morph pipeline

- `packSparseMorphs` — lossless packing of sparse morph deltas (vertex-sorted)
  into tightly packed storage buffers; only affected vertices are stored.
- `MORPH_COMPUTE_WGSL` — a per-vertex gather compute kernel that binary-searches
  each morph's delta range and adds `weight * delta` into the working buffer.
- `GpuMorphDeform` — owns the pipeline/bind groups and dispatches the kernel.
- `WebGpuHumanPipeline` — ties `CharacterGpuState` + `GpuMorphDeform` +
  `WebGPURenderer` together; `Human.create({ device })` builds it and
  `human.encodeFrame(view,w,h)` runs compute + draw.

Tests (`src/gpu/morph/gpu-morph.test.ts`) prove **CPU/GPU parity**: a faithful
JS port of the WGSL kernel produces byte-identical deformation to the CPU
`MorphKernel.accumulate` reference (verified via `npm test`).

### Canonical human parts (Phase 2)

The canonical human is a single global vertex/index array plus a set of
**addressable sub-meshes** (`CanonicalHuman.parts`), each with:

- stable per-part global vertex IDs (`vertexStart`/`vertexCount`) — never
  collide with the body regardless of body edits;
- its own region tag + index range (`indexStart`/`indexCount`) for per-part
  drawing;
- surface UVs in `[0,1]` for each part.

Parts built procedurally: `eye_l`/`eye_r` (sclera sphere), `iris_l`/`iris_r`
and `pupil_l`/`pupil_r` (discs), `teeth_upper`/`teeth_lower`, `tongue`, and
`mouth_cavity`. Each part renders with its own material color (skin / sclera
white / iris / teeth / tongue / cavity) via a per-part uniform in the renderer.

Parts are independently deformable: `face.eyeSpacing` spreads the body eyes
**and** the sclera/iris parts; `expression.jawOpen` lowers only the `tongue`
and `mouth_cavity`. The locality tests in
`src/geometry/canonical/parts.test.ts` prove a part morph touches only that
part's vertices and never unrelated parts (e.g. torso/hair).

### Parametric anatomy + rigging (Phase 3)

Identity body properties now resolve into **concrete, measured body dimensions**
and a **matching parametric skeleton**:

- `resolveAnatomy(def) → AnatomyDimensions` (`src/anatomy/parametric/`)
  is a deterministic, purely functional solver mapping `global.height`,
  `body.muscularity`/`bodyFat`/`chest`/`waist`/`hips`, and the
  `skeleton.*Length`/`shoulderWidth` factors into trunk heights, girths,
  shoulder width, and limb/foot lengths — shared by both geometry and skeleton.
- `validateAnatomy(dims)` is the anatomical-constraint side: it flags
  implausible shapes (e.g. waist exceeding chest) and returns a satisfaction
  score (`human.anatomyScore()`).
- `placeSkeletonFromDefinition(dims) → BoneDef[]` places a 21-joint T-pose whose
  segment lengths match the resolved anatomy, keeping joints registered with
  the deformed mesh as identity changes. `human.parametricSkeleton()` exposes it.
- **Corrective identity-body morphs** drive the same properties into the
  geometry via the event/morph pipeline (height, shoulder width, waist, body
  fat, spine/neck length), preserving stable per-vertex IDs and the
  "only affected GPU work recomputes" guarantee. Locality tests prove these
  body morphs never deform the face.

`Human` exposes `solveAnatomy()`, `anatomyConstraints()`, `anatomyScore()`, and
`parametricSkeleton()`. The demo adds Height / Waist / Shoulder sliders and
renders the resolved skeleton markers + anatomy readout.

### Rigging + skinning + skeletal animation (Phase 4)

The parametric skeleton is now wired to the mesh as a live **skinning rig**:

- `bone-matrix.ts` builds per-bone **world matrices** via forward kinematics
  (translation + quaternion, chained by parent). The standard
  `skinMatrix = invBindWorld * currentWorld` formulation means the rest pose is
  exactly identity — no animation, no movement — while rotating a bone deforms
  only the vertices bound to that bone (and its children).
- `skin-mesh.ts` extracts per-vertex bone influences from the canonical mesh's
  region weights (normalized, up to `MAX_INFLUENCES` = 4) and provides CPU
  skinning references: `skinMeshCPU` (positions) and `skinNormalsCPU` (normals).
- `skinning-kernel.ts` + `skin-wgsl.ts` is the GPU compute counterpart,
  chained *after* morph deformation: morph → skin → render. It skins **both
  positions and normals** (normals via the weighted rotation 3×3 + normalize, so
  posed limbs light correctly instead of keeping baked rest normals). Each WGSL
  loop is byte-identical to its CPU reference (verified by parity tests).
- `Human` gained `addClip` / `playClip` / `samplePose` / `setPose` / `animate`
  (reusing the `SkeletalAnimation` blend system), `skinScene()` and
  `skinNormals()` for the CPU references; the GPU pipeline exposes `setPose()`
  to upload skin matrices and returns both skinned position and normal buffers.

Tests (`src/gpu/kernels/skinning.test.ts`) prove FK correctness (identity at
rest), rest-pose preservation, GPU/CPU parity, normalization, and **locality**:
rotating `thigh_l` moves exactly its FK chain (`thigh_l` + `shin_l`) and never
the off-side limbs. The demo adds an **"Animate: wave"** toggle that replays a
clip through the rig.

## References to the spec

Each phase in `start.md` is scoped in the module layout (`src/core`, `src/compiler`,
`src/anatomy`, `src/identity`, `src/geometry`, `src/gpu`, `src/render`, `src/lod`,
`src/animation`, `src/ai`, `src/formats`). Planned systems (strand hair, cloth
physics, SDF collision, neural skin, WebGL2 fallback) are stubbed in the
capability matrix and open for the next milestones.

---

License: MIT
