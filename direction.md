# DaytonaWebGPUAvatar: FIRST PRIORITY IMPLEMENTATION

## Mission

Work on the existing repository:

`CityofDaytonaBeach/DaytonaWebGPUAvatar`

Do not redesign or restart the project.

The architecture already contains substantial infrastructure for:

* HumanDefinition
* CharacterEvent
* dependency graph
* delta compiler
* dirty regions
* sparse morphs
* WebGPU morph compute
* GPU skinning
* identity preservation
* anatomical constraints
* timeline/history
* attachments
* LOD
* animation
* facial controls
* speech
* rendering

STOP adding broad new feature categories.

The current priority is:

# BUILD DAYTONA HD HUMAN CORE V0.1

The goal is to replace the procedural block representation as the primary visual human with a real, animation-ready canonical human while preserving the existing runtime architecture.

The block human must remain as a debug/testing provider.

---

# PRIORITY 1: AUDIT FIRST

Before changing code:

1. Pull current `main`.
2. Inspect the complete repository.
3. Run:

   * tests
   * type checking
   * build
   * demo build
4. Identify the current canonical-human interfaces.
5. Identify the topology asset adapter.
6. Identify semantic region handling.
7. Identify sparse morph integration.
8. Identify skeleton/skin-weight integration.
9. Identify renderer assumptions about topology.
10. Identify anything that assumes the current block-human vertex layout.

Produce a short internal implementation map before coding.

Do not duplicate systems that already exist.

---

# PRIORITY 2: CANONICAL HUMAN PROVIDER

The engine needs a clean separation between the runtime and the source of canonical geometry.

Implement or complete:

```ts
interface CanonicalHumanProvider {
  load(): Promise<CanonicalHumanAsset>;
  validate(): CanonicalValidationResult;
  topologyVersion(): string;
}
```

Providers:

```text
CanonicalHumanProvider
        │
        ├── DebugBlockHumanProvider
        │
        └── HDCanonicalHumanProvider
```

Preserve the existing block human.

The HD provider should load a production-quality canonical asset.

The `Human` runtime should not care which provider generated/loaded the topology.

Do not make HumanDefinition provider-specific.

---

# PRIORITY 3: DEFINE THE HD CANONICAL ASSET CONTRACT

Before hunting for prettier rendering, define exactly what Daytona requires from an HD human.

Create a versioned specification:

```text
DaytonaCanonicalHuman v0.1
```

Required data:

```text
positions
normals
tangents
UV coordinates
triangle indices

stable vertex IDs
stable triangle IDs

semantic regions
anatomical landmarks

skeleton
inverse bind matrices
skin weights
skin joint indices

head
body
eyes
teeth
gums
tongue
```

Optional initially:

```text
eyelashes
eyebrows
hair
clothing
```

Do NOT require hair or clothing for this milestone.

---

# PRIORITY 4: SEMANTIC REGIONS

The HD mesh cannot simply be a giant anonymous collection of vertices.

Map vertices/triangles into semantic human regions.

At minimum implement:

```text
HEAD

forehead
temple_left
temple_right

eye_left
eye_right

upper_eyelid_left
lower_eyelid_left

upper_eyelid_right
lower_eyelid_right

nose_bridge
nose_tip
nose_alar_left
nose_alar_right

cheek_left
cheek_right

upper_lip
lower_lip
mouth_corner_left
mouth_corner_right

jaw_left
jaw_right
chin

ear_left
ear_right

neck
```

And body regions:

```text
chest
abdomen
back

shoulder_left
shoulder_right

upper_arm_left
upper_arm_right

forearm_left
forearm_right

hand_left
hand_right

pelvis

thigh_left
thigh_right

shin_left
shin_right

foot_left
foot_right
```

A region may contain multiple non-contiguous ranges.

Do not assume:

```text
nose = vertices 1000 through 2000
```

Design for:

```text
nose = multiple vertex/triangle sets
```

---

# PRIORITY 5: ANATOMICAL LANDMARKS

Create stable landmarks.

Start with approximately 30-50 important landmarks.

Examples:

```text
head_top

eye_left_center
eye_right_center

eye_left_inner_corner
eye_left_outer_corner

eye_right_inner_corner
eye_right_outer_corner

nose_bridge
nose_tip
nose_alar_left
nose_alar_right

mouth_center
mouth_corner_left
mouth_corner_right

chin

jaw_angle_left
jaw_angle_right

ear_left_center
ear_right_center

shoulder_left
shoulder_right

elbow_left
elbow_right

wrist_left
wrist_right

hip_left
hip_right

knee_left
knee_right

ankle_left
ankle_right
```

Prefer surface-relative representation:

```ts
interface HumanLandmark {
  id: number;
  name: string;

  triangleId: number;

  barycentric: [
    number,
    number,
    number
  ];

  normalOffset: number;
}
```

This allows landmarks to survive deformation.

---

# PRIORITY 6: HUMAN SHAPE SPACE V0.1

This is the most important new algorithmic subsystem.

Create:

```text
src/anatomy/shape-space/
```

Start with:

```text
human-shape-space.ts
shape-basis.ts
shape-coefficient-solver.ts
shape-corrective-solver.ts
shape-space.test.ts
```

The purpose is to stop treating semantic parameters as simplistic vertex movement.

Architecture:

```text
HumanDefinition

       ↓

Changed semantic properties

       ↓

Anatomical constraints

       ↓

Identity constraints

       ↓

ShapeCoefficientSolver

       ↓

HumanShapeSpace

       ↓

CorrectiveShapeSolver

       ↓

Sparse deformation

       ↓

Existing WebGPU morph pipeline
```

---

# PRIORITY 7: BUILD ONLY 10 IDENTITY CONTROLS FIRST

Do NOT immediately build 300 controls.

Prove the architecture with ten.

Implement:

```text
face.nose.width
face.nose.length

face.jaw.width
face.chin.projection

face.eye.spacing
face.eye.size

face.cheek.width

face.mouth.width
face.upperLip.thickness
face.lowerLip.thickness
```

Every control must go through:

```text
HumanDefinition
→ event
→ dependency graph
→ shape solver
→ sparse deformation
→ WebGPU
```

No direct UI-to-vertex mutations.

---

# PRIORITY 8: CORRELATED DEFORMATION

This is critical.

For example:

```text
face.jaw.width
```

must NOT mean:

```ts
vertex.x *= jawWidth;
```

Instead:

```text
jaw width
    ↓
mandible deformation
    ↓
jaw angle transition
    ↓
chin relationship
    ↓
cheek transition
    ↓
under-chin transition
```

Likewise:

```text
nose.width
```

can influence:

```text
alar width
nostril relationship
tip width
bridge transition
cheek/nose transition
```

This is the beginning of Daytona's anatomical shape system.

---

# PRIORITY 9: SHAPE BASIS REPRESENTATION

Create reusable shape bases.

Conceptually:

```text
Base Human

+

NoseWidthBasis × coefficient

+

JawWidthBasis × coefficient

+

EyeSpacingBasis × coefficient

+

CheekWidthBasis × coefficient

...
```

The final shape becomes:

```text
Pfinal =
Pbase
+
Σ(Basis_i × coefficient_i)
+
Σ(Corrective_i × activation_i)
```

Do not generate an entirely new mesh.

---

# PRIORITY 10: USE THE EXISTING SPARSE MORPH SYSTEM

Do not replace Daytona's sparse morph architecture.

Compile shape bases into the existing sparse representation.

Example:

```text
NoseWidthBasis

affected vertices:
3,814

instead of:

entire human:
180,000
```

Then only upload/process affected data.

The purpose is to prove:

> Human semantic modifications can be compiled into localized GPU work.

---

# PRIORITY 11: BUILD CORRECTIVE MORPHS

Implement the foundation for combination correctives.

Example:

```text
wide jaw
+
wide mouth
```

may require:

```text
WideJawWideMouthCorrective
```

Create a generalized system:

```ts
interface CorrectiveRule {
  inputs: CorrectiveInput[];
  outputBasisId: number;
}
```

Activation should be continuous rather than simple true/false switching.

---

# PRIORITY 12: HD HEAD FIRST

Do NOT attempt the entire body before proving the face.

The first visible milestone is:

# DAYTONA HD HEAD V0.1

Requirements:

```text
real head topology

real eye geometry

teeth
tongue

semantic regions

landmarks

10 identity controls

sparse shape basis

correctives

WebGPU deformation

existing facial animation

existing speech controls

basic skin material
```

The character does not need cinematic hair or clothing yet.

---

# PRIORITY 13: BASIC REALISTIC SKIN

Do enough skin rendering to properly evaluate geometry.

Implement:

```text
base color
roughness
specular
normal map
basic subsurface scattering
```

Do NOT spend weeks on neural skin yet.

The purpose of this renderer is:

> Can we actually see whether the underlying human geometry is correct?

---

# PRIORITY 14: BASIC REALISTIC EYES

Implement:

```text
sclera
iris
pupil
cornea
limbus
```

Cornea must be a separate surface.

Add:

```text
corneal specular
basic refraction
iris depth
```

Do not prioritize tear simulation yet.

---

# PRIORITY 15: CONNECT EXISTING FACIAL ANIMATION

Once HD geometry works, connect the existing expression system.

Test:

```text
neutral
smile
frown
blink
jaw open
```

Identity must remain stable.

For example:

```text
neutral Daniel
↓
smile
↓
still Daniel
```

not:

```text
neutral Daniel
↓
smile
↓
Daniel's suspiciously different cousin
```

---

# PRIORITY 16: CONNECT EXISTING SPEECH

Use the existing speech/viseme system.

Test:

```text
"Welcome to Daytona."
```

Verify:

```text
jaw
lips
mouth
```

deform correctly on the HD topology.

Do not expand TTS infrastructure yet.

This milestone is about geometry.

---

# PRIORITY 17: LOCALIZED EDIT PROOF

Create a developer visualization.

When:

```text
face.nose.width
0.50 → 0.55
```

show affected vertices.

For example:

```text
GRAY
unchanged vertices

HIGHLIGHTED
affected vertices
```

Display:

```text
Total vertices

Affected vertices

Affected percentage

Shape bases activated

Correctives activated

Dependency nodes visited

GPU kernels dispatched
```

This is extremely important.

It visually proves the Daytona architecture.

---

# PRIORITY 18: GPU BENCHMARK

Use the existing timestamp infrastructure.

For each edit report where available:

```text
Delta compile CPU:
0.xx ms

Shape solve CPU:
0.xx ms

GPU morph:
0.xx ms

GPU normals:
0.xx ms

Total update:
0.xx ms
```

Never invent unavailable GPU timing.

---

# PRIORITY 19: IDENTITY TEST

Create a canonical identity.

Record its Identity Vector.

Run:

```text
nose narrower
undo

jaw wider
undo

eyes larger
undo

smile
neutral

speak
neutral
```

Verify that unrelated identity properties remain unchanged.

---

# PRIORITY 20: EXACT UNDO TEST

This is mandatory.

Run:

```text
BASE HUMAN

↓
jaw.width +10%

↓
UNDO
```

The resulting HumanDefinition and geometry must exactly match the original within defined floating-point tolerance.

Do the same for every first-generation identity control.

---

# PRIORITY 21: COMBINATION TESTS

Test:

```text
wide jaw
+
narrow nose
+
larger eyes
+
thicker lips
```

Then:

```text
smile
blink
speak
```

Look for:

```text
mesh intersections
broken eyelids
broken mouth
collapsed cheeks
identity drift
normal artifacts
```

---

# PRIORITY 22: RANDOMIZED FACE FUZZING

Generate thousands of deterministic face definitions within REALISTIC constraints.

Example:

```text
for seed 1..5000
    generate parameters
    solve shape
    validate geometry
```

Check:

```text
NaN
Infinity
invalid indices
invalid buffers
extreme vertex movement
self-intersection
invalid landmarks
GPU validation errors
```

This catches parameter combinations humans will eventually discover five minutes after release.

---

# PRIORITY 23: DO NOT WORK ON THESE YET

Until HD HEAD V0.1 passes its acceptance tests, DO NOT prioritize:

```text
organs
advanced internal anatomy

strand hair improvements

advanced cloth

new clothing system

neural rendering

Gaussian splatting

WebNN

advanced aging

photo-to-human

crowd rendering

new AI agents

new prompt architecture

additional animation formats
```

These are later systems.

The engine already has enough breadth.

We now need depth.

---

# REQUIRED DEMO

Build one demo character.

Display:

```text
DAYTONA HD HUMAN V0.1
```

Provide controls:

```text
Nose Width
Nose Length

Jaw Width
Chin Projection

Eye Spacing
Eye Size

Cheek Width

Mouth Width
Upper Lip
Lower Lip
```

And:

```text
Neutral
Smile
Blink
Jaw Open
Speak
Undo
Redo
```

Include:

```text
Show Semantic Regions

Show Landmarks

Show Affected Vertices

Show Skeleton

Show GPU Statistics
```

---

# REQUIRED TEST SEQUENCE

Automatically execute:

```text
Create HD human

↓

Nose width +10%

↓

Verify only expected dependency regions changed

↓

Smile

↓

Verify identity unchanged

↓

Speak "Welcome to Daytona"

↓

Modify jaw during speech

↓

Verify animation continues

↓

Undo jaw modification

↓

Verify exact restoration

↓

Return neutral

↓

Compare against original identity
```

---

# ACCEPTANCE CRITERIA

HD HEAD V0.1 is successful only if:

1. A real canonical human head is rendered.

2. HumanDefinition remains the source of truth.

3. Ten identity parameters work.

4. Semantic regions work.

5. Anatomical landmarks work.

6. Shape coefficients are used.

7. Sparse morphs are used.

8. Existing WebGPU deformation is used.

9. Existing dependency/delta architecture is preserved.

10. Identity remains stable.

11. Facial expressions work.

12. Speech deformation works.

13. Undo/redo works.

14. Localized edits can be measured.

15. GPU work can be profiled.

16. No full human regeneration occurs for localized changes.

---

# AFTER THIS MILESTONE

Only after HD HEAD V0.1 works, proceed in this order:

```text
HD HEAD V0.1
      ↓
HD BODY V0.1
      ↓
Production Skeleton
      ↓
Pose Correctives
      ↓
Muscle/Tissue
      ↓
Advanced Skin
      ↓
Advanced Eyes
      ↓
Hair
      ↓
Clothing
      ↓
Full Performance
      ↓
Aging/Evolution
      ↓
Advanced Neural Experiments
```

---

# FINAL RULE

The purpose of this milestone is NOT to make the largest digital-human codebase.

The purpose is to prove this equation:

```text
REAL HD HUMAN
+
SEMANTIC CHARACTER STATE
+
ANATOMICAL SHAPE SPACE
+
DEPENDENCY GRAPH
+
DELTA COMPILER
+
SPARSE GPU COMPUTATION
=
CONTINUOUSLY MODIFIABLE DIGITAL HUMAN
```

Start by making ONE excellent head work.

Once the head can change identity parameters, smile, blink, speak, undo those changes, preserve identity, and prove that only affected GPU work was performed, the core Daytona architecture has passed its first serious test.

Implement that before expanding feature breadth.
