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


added 
# DaytonaWebGPUAvatar: Architecture Direction & No-Upload Human SDK Mandate

## Mission

Continue development of:

`CityofDaytonaBeach/DaytonaWebGPUAvatar`

This repository is intended to become a **browser-native, self-contained, programmable digital-human SDK powered primarily by WebGPU**.

Before implementing anything, inspect the CURRENT repository and reuse the systems that already exist.

DO NOT restart the project.

DO NOT replace the existing architecture with a conventional GLB/avatar viewer.

DO NOT make external human-model uploads a requirement.

The primary product goal is:

> A developer installs/imports the Daytona SDK, calls `Human.create()`, and receives a complete Daytona-generated digital human without uploading a human mesh, GLB, FBX, OBJ, MetaHuman, Ready Player Me avatar, or other external character.

The SDK itself must contain or generate everything required for its default human.

---

# 1. NON-NEGOTIABLE PRODUCT EXPERIENCE

The final developer experience should approach:

```ts
import { Human } from '@daytona/avatar';

const human = await Human.create();

human.modify({
  height: 1.82,
  'face.jaw.width': 0.62,
  'face.nose.width': 0.44,
});

human.setExpression('smile', 0.7);

human.speak('Welcome to Daytona.');

human.walkTo([4, 0, 8]);
```

This must NOT require:

```text
Upload GLB
Upload FBX
Upload OBJ
Upload avatar
Open Blender
Open Unreal
Create MetaHuman
Run external character generator
Call server-side mesh-generation service
```

A normal application should be able to create a human entirely through the SDK.

---

# 2. CENTRAL ARCHITECTURAL INVARIANT

Never forget:

```text
THE CHARACTER IS NOT THE MESH.
```

The character is:

```text
HumanDefinition
+
Identity
+
Anatomical Relationships
+
Constraints
+
Timeline / History
+
Attachments
+
Behavior / Performance State
```

The visible mesh is a compiled representation of that state.

Therefore:

```text
HumanDefinition
      ↓
Human Compiler
      ↓
Anatomical Shape
      ↓
GPU State
      ↓
Rendered Human
```

Never make the rendered mesh the authoritative character state.

---

# 3. SECOND CENTRAL INVARIANT

Localized changes must NOT regenerate the entire human.

Example:

```text
"Make the nose 5% narrower."
```

must become approximately:

```text
Prompt
↓
Semantic CharacterEvent
↓
face.nose.width changes
↓
Dependency Graph
↓
Affected anatomical relationships
↓
Shape coefficients
↓
Correctives
↓
Sparse vertex changes
↓
Minimal WebGPU work
↓
Same human
```

NOT:

```text
Prompt
↓
AI generates another human
```

---

# 4. AI MUST NOT GENERATE FINAL GEOMETRY

AI is a semantic director.

AI may interpret:

```text
"Make her taller with a slightly narrower jaw."
```

into:

```json
{
  "body.height": 1.82,
  "face.jaw.width": 0.46
}
```

The deterministic Daytona engine must then create the anatomical/geometric result.

Never ask an LLM to produce:

```text
vertex positions
triangle lists
arbitrary mesh topology
raw skinning weights
final SDF human surface
```

AI controls meaning.

Daytona controls anatomy and geometry.

---

# 5. PRESERVE EXISTING ARCHITECTURE

The repository already contains important systems.

Inspect them before writing replacements.

Preserve and extend systems including:

```text
HumanDefinition
CharacterEvent
Human API
DependencyGraph
DeltaCompiler
DirtyRegionTracker
IdentitySolver
ConstraintSolver
CharacterTimeline
CanonicalHumanProvider
Canonical topology validation
Semantic regions
Landmarks
SparseMorphSet
MorphDriver
MorphKernel
HumanShapeSpace
ShapeCoefficientSolver
CorrectiveShapeSolver
Skeleton
Skinning
WebGPU pipeline
Facial expressions
Speech
Motion
LOD
Attachments
Profiler
```

Do not create competing architectures for functionality that already exists.

---

# 6. PROVIDER ARCHITECTURE

Keep the existing:

```ts
CanonicalHumanProvider
```

abstraction.

But change the long-term production hierarchy to:

```text
CanonicalHumanProvider
          │
          ├── DebugBlockHumanProvider
          │
          ├── DaytonaGeneratedHumanProvider
          │
          └── ImportedHumanProvider
```

Responsibilities:

### DebugBlockHumanProvider

Keep the existing procedural/block human.

Purpose:

```text
unit testing
GPU testing
dependency testing
delta testing
CI
debugging
benchmarking
```

Never remove it.

### DaytonaGeneratedHumanProvider

THIS becomes the primary/default production provider.

It must create/load Daytona's own canonical human representation using SDK-owned data.

It must NOT require a user upload.

### ImportedHumanProvider

Optional interoperability feature.

It may support compatible:

```text
GLB
glTF
other future formats
```

But imported geometry must NEVER become required for:

```ts
Human.create()
```

---

# 7. DEFAULT CREATION BEHAVIOR

Eventually:

```ts
const human = await Human.create();
```

must internally behave approximately like:

```text
Human.create()
       ↓
DaytonaGeneratedHumanProvider
       ↓
Daytona Canonical Topology
       ↓
HumanDefinition
       ↓
Shape Space
       ↓
Skeleton
       ↓
Skinning
       ↓
Materials
       ↓
WebGPU
       ↓
Human
```

No application-provided human asset should be necessary.

---

# 8. DAYTONA CANONICAL HUMAN

Create Daytona's own versioned canonical-human specification.

Example:

```text
DaytonaCanonicalHuman v0.1
```

The SDK should own a stable canonical topology.

It should contain or generate:

```text
positions
triangle connectivity
normals
tangents
UVs

stable vertex IDs
stable triangle IDs

semantic regions
anatomical landmarks

skeleton
joint definitions
inverse bind matrices
skin weights

head
body
eyes
teeth
gums
tongue
```

Later:

```text
eyelashes
eyebrows
hair
nails
```

The canonical representation may be stored using compact binary assets distributed WITH the SDK.

This does NOT violate the no-upload requirement.

The requirement is:

> The application/user does not need to supply the human.

---

# 9. DO NOT PROCEDURALLY REBUILD TOPOLOGY FOR EVERY PERSON

Do not generate completely unrelated triangle topology for each new human.

Instead:

```text
ONE STABLE DAYTONA CANONICAL TOPOLOGY
                  +
           HUMAN SHAPE SPACE
                  +
           HUMAN DEFINITION
                  =
        MANY DIFFERENT HUMANS
```

Humans should generally share:

```text
vertex identity
triangle identity
semantic regions
UV structure
rig conventions
attachment system
facial-control conventions
```

This provides enormous benefits for:

```text
animation
facial deformation
attachments
tattoos
clothing
GPU optimization
morphs
LOD
networking
caching
serialization
undo/redo
identity preservation
```

---

# 10. HUMAN SHAPE SPACE IS NOW A CORE SYSTEM

Continue building the existing:

```text
src/anatomy/shape-space/
```

This system must become Daytona's mathematical vocabulary for human variation.

Conceptually:

```text
Canonical Human
+
Identity Shape Basis
+
Face Shape Basis
+
Body Shape Basis
+
Age Shape Basis
+
Corrective Shape Basis
=
Current Human Shape
```

Do not implement semantic parameters as simplistic scaling.

For example:

```text
face.jaw.width
```

must NOT become:

```ts
vertex.x *= width;
```

It should resolve into correlated anatomical changes.

---

# 11. BUILD ANATOMICAL CORRELATION

Example:

```text
face.jaw.width
```

may influence:

```text
mandible width
gonial angle
masseter region
chin transition
cheek transition
under-chin tissue
neck transition
```

Example:

```text
face.nose.width
```

may influence:

```text
nasal bridge
alar width
nostril relationship
tip width
cheek/nose transition
```

Example:

```text
body.muscularity
```

may influence:

```text
shoulders
deltoids
pectorals
upper arms
forearms
back
abdomen
glutes
thighs
calves
```

Use anatomical relationships, not global vertex scaling.

---

# 12. SHAPE BASIS MODEL

Use something conceptually equivalent to:

```text
Pfinal =
Pcanonical
+
Σ(identityBasis × coefficient)
+
Σ(bodyBasis × coefficient)
+
Σ(ageBasis × coefficient)
+
Σ(correctiveBasis × activation)
```

Shape bases should ultimately compile into Daytona's existing sparse morph/deformation architecture.

---

# 13. KEEP DEFORMATION SPARSE

If:

```text
face.nose.width
```

affects 3,000 vertices out of 200,000, do not process 200,000 unnecessarily.

Pipeline:

```text
Semantic Change
↓
Dependency Graph
↓
Shape Solver
↓
Affected Shape Bases
↓
Affected Vertex IDs
↓
Sparse Morph Data
↓
WebGPU
```

Track:

```text
total vertices
affected vertices
affected %
dependency nodes
shape bases
correctives
compute passes
CPU time
GPU time when measurable
```

---

# 14. GPU-RESIDENT HUMAN STATE

Keep large mutable rendering/deformation state GPU-resident wherever practical.

CPU/TypeScript should primarily send:

```text
small semantic parameter changes
events
animation state
timeline changes
```

Avoid repeatedly transferring entire human meshes between CPU and GPU.

---

# 15. HUMAN PARAMETER BUFFER

Continue moving toward a packed GPU representation of HumanDefinition.

Conceptually:

```text
HumanDefinition
↓
Schema Compiler
↓
Stable property IDs
↓
GPU offsets
↓
HumanParameterBuffer
```

WebGPU kernels should consume this state efficiently.

---

# 16. HUMAN DEPENDENCY GRAPH

Treat the human as a connected biological system.

Example:

```text
shoulderWidth
      ↓
clavicle position
      ↓
shoulder joint
      ↓
deltoid region
      ↓
arm placement
      ↓
skin
      ↓
clothing fit
```

The graph determines what becomes dirty.

The graph must not automatically mean every dependent system is recomputed immediately.

The Delta Compiler and GPU Scheduler decide actual work.

---

# 17. IDENTITY MUST REMAIN SEPARATE

Maintain an Identity Vector.

Important identity dimensions include:

```text
skull
eyes
eye spacing
nose
jaw
chin
mouth
cheeks
facial proportions
asymmetry
distinctive features
```

Operations such as:

```text
smile
blink
speak
walk
change shirt
grow hair
```

must not alter identity.

---

# 18. IDENTITY PRESERVATION

Every CharacterEvent should have an identity modification budget.

Example:

```text
Smile
Identity budget = zero
```

Example:

```text
Make nose narrower
Editable identity region = nose
Everything else = protected
```

Example:

```text
Create a completely different person
Identity modification budget = high
```

Prevent gradual identity drift.

---

# 19. ANATOMICAL CONSTRAINT MODES

Preserve:

```text
REALISTIC
STYLIZED
FANTASY
```

REALISTIC should enforce strong human anatomical relationships.

STYLIZED may relax them.

FANTASY may permit extreme proportions.

Never hard-code realistic constraints so deeply that other modes become impossible.

---

# 20. SKELETON GENERATION

The Daytona human must include its own skeleton.

The application should not upload one.

Architecture:

```text
HumanDefinition
↓
Anatomical proportions
↓
Skeleton Generator
↓
Joint positions
↓
Bone lengths
↓
Inverse bind transforms
↓
Skinning
```

Skeleton dimensions must adapt to anatomy.

Changing height should not leave joints behind.

---

# 21. PRODUCTION SKELETON DIRECTION

Gradually move toward a production humanoid skeleton including:

```text
root
pelvis

spine
chest
neck
head

jaw
eyes

clavicles
scapular controls
shoulders

upper arms
twist bones
forearms
wrists

full fingers

hips
thighs
thigh twist
knees
shins
ankles
feet
toes
```

Do not attempt everything simultaneously.

---

# 22. POSE CORRECTIVES

Skinning alone is insufficient.

Use:

```text
Skeleton
+
Skinning
+
Pose-space correctives
```

Especially for:

```text
shoulders
elbows
wrists
hips
knees
neck
jaw
```

---

# 23. EVENT ARCHITECTURE REMAINS UNIVERSAL

All modification sources must converge on:

```text
CharacterEvent
```

Including:

```text
AI prompts
UI controls
API calls
automation
timeline
simulation
animation systems
external integrations
```

Do not create separate mutation pathways.

---

# 24. UNDO / REDO / HISTORY

Because HumanDefinition is authoritative:

```text
event
↓
new semantic state
↓
compiled visual state
```

Every meaningful edit must support:

```text
undo
redo
snapshot
restore
history
versioning
```

Restoring a state must reproduce the same human deterministically within documented numerical tolerances.

---

# 25. TIME IS A FIRST-CLASS INPUT

Long term:

```text
Human at Time T =
Base Human
+
Timeline Events
+
Progressive State
+
Temporary State
```

This allows:

```text
aging
hair growth
fitness changes
body composition
tanning
wrinkles
gray hair
temporary fatigue
environmental effects
```

without replacing the character.

---

# 26. ATTACHMENTS MUST BE HUMAN-RELATIVE

Do not attach objects using permanent world XYZ coordinates.

Use semantic/surface coordinates.

Example:

```text
human://ear/left/helix
```

or:

```text
triangleId
+
barycentric coordinates
+
normal offset
```

Use for:

```text
tattoos
piercings
jewelry
wearables
medical devices
future accessories
```

Attachments must survive deformation.

---

# 27. SKIN SYSTEM

Eventually separate skin into:

```text
MACRO
geometry/anatomical form

MESO
folds/wrinkles/scars

MICRO
pores/fine lines/micro-normal

OPTICAL
pigmentation
blood coloration
roughness
specular
SSS
oiliness
wetness
```

Do not bake all skin realism into one texture.

---

# 28. PROCEDURAL DETAIL

Because the SDK should not require user uploads, procedural detail is valuable.

Develop deterministic systems for:

```text
pores
micro wrinkles
minor pigmentation variation
roughness variation
freckles
small veins
skin imperfections
```

Use stable human-relative coordinates.

Details must not swim across the skin during animation.

---

# 29. EYES

Daytona should generate/provide its own eye system.

Use separate structures for:

```text
sclera
iris
pupil
cornea
limbus
tear film
```

Later:

```text
tear line
micro veins
advanced refraction
```

Eyes remain attached to the skeleton/anatomical landmarks.

---

# 30. HAIR

Long-term Daytona hair should be parameter-driven:

```text
hairline
density
length
thickness
curl
wave
frizz
clumping
part
color
gray %
```

Possible pipeline:

```text
Scalp
↓
Follicles
↓
Guide curves
↓
GPU interpolation
↓
Strands/clusters
↓
Physics
↓
LOD
```

Do not require an uploaded hairstyle for the default SDK experience.

---

# 31. CLOTHING

Long term, Daytona should support SDK-provided/generated garments.

Pipeline:

```text
Human anatomy
↓
Measurements
↓
Garment definition
↓
Fit
↓
Skinning
↓
Collision
↓
Cloth simulation
```

External garments may later be supported, but should not define the core architecture.

---

# 32. FACIAL PERFORMANCE

Keep identity and performance separate.

Use:

```text
Identity Shape
+
Expression Shape
+
Speech Shape
+
Correctives
=
Current Face
```

Expressions must not mutate identity.

---

# 33. SPEECH

Architecture:

```text
Text / Audio
↓
Phonemes
↓
Visemes
↓
Co-articulation
↓
Jaw
Lips
Tongue
Cheeks
↓
Facial performance
```

Speech should operate on the same persistent human.

---

# 34. MOTION

High-level commands should compile into deterministic motion.

Example:

```text
"walk to the desk and wave"
```

becomes:

```text
locomotion
+
target
+
IK
+
gesture
+
timing
```

AI must not generate raw bone matrices frame-by-frame.

---

# 35. LIVE MODIFICATION

A critical Daytona capability is modifying a human while it is performing.

This should eventually work:

```text
Human walking
+
Human speaking
+
Human smiling
+
Change hair
+
Change jacket
+
Change jaw slightly
```

without:

```text
reload
regeneration
animation restart
identity replacement
```

---

# 36. HUMAN LOD

LOD should be semantic, not merely polygon count.

Example:

```text
Close face:
high eyes
high skin
high lips
high facial deformation
high hairline
```

while:

```text
feet:
lower quality
```

A full-body distant character can make different choices.

---

# 37. PERCEPTUAL LOD

Allocate rendering/computation according to what humans notice.

Potential priority:

```text
eyes
face
mouth
hands
silhouette
hair
clothing
body
```

depending on camera and action.

---

# 38. GPU SCHEDULER

Maintain a frame budget.

Conceptually:

```text
16.67 ms at 60 FPS
```

Every workload should eventually have:

```text
priority
estimated cost
measured cost
visibility
perceptual importance
deadline
```

Scheduler decisions:

```text
RUN
REDUCE
REUSE
DEFER
SKIP
```

Do not claim performance without measurements.

---

# 39. TEMPORAL REUSE

If something did not change, reuse it when valid.

Example:

```text
nose modification
```

should not force recalculation of:

```text
feet
shirt physics
hair color
leg anatomy
```

unless dependencies actually require it.

---

# 40. NO SERVER REQUIREMENT FOR CORE HUMAN GENERATION

The default Daytona human-generation pipeline must run client-side.

Target:

```text
Browser
+
JavaScript/TypeScript
+
WebGPU
+
WASM where appropriate
```

No required:

```text
VPS
GPU server
Unreal server
Blender server
AI rendering server
mesh-generation API
```

Optional cloud services may later enhance functionality.

They must not be required to create and render the base Daytona human.

---

# 41. WASM IS ALLOWED

Use WASM where it is better suited for:

```text
complex topology processing
compression
decoding
geometry validation
heavy CPU algorithms
serialization
```

Use WebGPU for highly parallel work such as:

```text
morph accumulation
skinning
deformation
normals
hair
cloth
soft tissue
LOD
rendering
```

Choose based on benchmarks, not ideology.

---

# 42. SDK ASSET PACKAGING

No-upload does NOT mean no data.

The SDK may ship compressed internal assets.

For example:

```text
daytona-human-core.bin
daytona-topology.bin
daytona-shape-basis.bin
daytona-skeleton.bin
daytona-skin-data.ktx2
```

These are implementation details.

The consumer should simply call:

```ts
Human.create();
```

---

# 43. STREAMING IS ALLOWED

Large optional HD resources may be distributed with the SDK/CDN and streamed automatically.

Example:

```text
core topology
↓
basic human appears
↓
higher skin detail streams
↓
higher hair detail streams
↓
cinematic resources become available
```

No manual upload.

---

# 44. OFFLINE MODE

Design core assets so the SDK can eventually support:

```text
prepackaged application
+
cached Daytona assets
+
browser
=
offline human creation
```

Do not architect the fundamental character system around mandatory network calls.

---

# 45. IMPORTS ARE OPTIONAL INTEROPERABILITY

Supporting GLB/glTF later is useful.

But:

```text
Imported Human
```

must be an alternative provider.

Never change the architecture into:

```text
Daytona = GLB loader + sliders
```

That is explicitly NOT the goal.

---

# 46. EXPORT IS ALSO IMPORTANT

Eventually support:

```text
GLB/glTF
Daytona package
animation
snapshot
```

But exported meshes remain representations.

The authoritative Daytona character should remain something like:

```text
.dhuman
```

containing:

```text
HumanDefinition
identity
shape coefficients
appearance
attachments
timeline
references to canonical topology/version
```

---

# 47. CREATE A DAYTONA HUMAN PACKAGE

Design a future format:

```text
person.dhuman
```

Possible structure:

```text
manifest
schemaVersion
topologyVersion

HumanDefinition
IdentityVector

shape coefficients

skin definition
hair definition

attachments
clothing

timeline
animation references

random seeds
```

Loading it should reconstruct the same person.

---

# 48. DETERMINISM

Given:

```text
same SDK version
same canonical topology
same HumanDefinition
same seeds
same timeline
```

the SDK should reconstruct the same character within documented numerical tolerances.

This is crucial for:

```text
saving
networking
automation
versioning
testing
reproducibility
```

---

# 49. MULTIPLE HUMANS

Do not design everything around one global character.

Eventually support:

```ts
const a = await Human.create();
const b = await Human.create();
const c = await Human.create();
```

Share immutable resources:

```text
canonical topology
shape bases
shader pipelines
animation clips
static textures
```

while maintaining per-human:

```text
HumanDefinition
coefficients
pose
timeline
attachments
appearance
GPU parameter state
```

---

# 50. KEEP THE PUBLIC API SIMPLE

The internal system can be extremely sophisticated.

The public SDK should not be.

Desired experience:

```ts
const human = await Human.create();

human.modify(...);
human.prompt(...);

human.setExpression(...);
human.lookAt(...);

human.walkTo(...);
human.speak(...);

human.addTattoo(...);
human.addPiercing(...);
human.wear(...);

human.advanceTime(...);

human.undo();
human.redo();

human.save();
```

Do not expose internal complexity unnecessarily.

---

# 51. SCHEMA-FIRST DEVELOPMENT

HumanDefinition must remain schema-driven.

Every property should eventually know:

```text
stable ID
name
type
units
default
minimum
maximum
persistence category
identity importance
anatomical dependencies
GPU offset
LOD importance
```

Generate as much as possible from one authoritative schema.

Avoid manually maintaining conflicting definitions.

---

# 52. PERSISTENCE CATEGORIES

Properties should be classified approximately as:

```text
IDENTITY
PROGRESSIVE
TEMPORARY
PERFORMANCE
ENVIRONMENTAL
```

Examples:

```text
nose structure = IDENTITY

wrinkle progression = PROGRESSIVE

blush = TEMPORARY

smile = PERFORMANCE

wet skin = ENVIRONMENTAL
```

This becomes important for automation and time evolution.

---

# 53. FIRST CURRENT MILESTONE

Do not attempt the whole vision simultaneously.

The immediate milestone remains:

# DAYTONA GENERATED HD HEAD V0.1

It must NOT require a user-supplied human asset.

Implement:

```text
DaytonaGeneratedHumanProvider

Daytona canonical head topology

semantic facial regions

anatomical landmarks

Human Shape Space

10 identity controls

shape coefficient solver

corrective solver

existing sparse deformation

existing WebGPU compute

basic skin

basic realistic eyes

existing expressions

existing speech
```

---

# 54. FIRST 10 IDENTITY CONTROLS

Implement and prove:

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

No direct UI-to-vertex modifications.

---

# 55. REQUIRED PROOF

The demo must demonstrate:

```text
Human.create()
↓
Daytona human appears
↓
NO uploaded model
↓
nose width +10%
↓
localized geometry changes
↓
smile
↓
same identity
↓
speak
↓
change jaw while speaking
↓
speech continues
↓
undo
↓
exact previous state restored
```

---

# 56. DEVELOPMENT VISUALIZATION

Provide developer overlays for:

```text
semantic regions
landmarks
skeleton
affected vertices
dirty systems
shape bases
correctives
GPU statistics
LOD
```

This SDK needs to prove what it is doing internally.

---

# 57. REQUIRED PERFORMANCE REPORTING

For a semantic edit report:

```text
Property changed:
face.nose.width

Dependencies visited:
...

Shape bases:
...

Correctives:
...

Total vertices:
...

Affected vertices:
...

Affected percentage:
...

CPU delta compilation:
...

CPU shape solve:
...

GPU morph:
...

GPU normals:
...

Total:
...
```

Only report real measurements.

---

# 58. REQUIRED TESTS

Maintain/add tests for:

```text
HumanDefinition determinism

CharacterEvent application

dependency locality

shape-space coefficients

corrective activation

sparse deformation

identity preservation

constraint enforcement

undo/redo

snapshot restoration

landmark stability

semantic regions

GPU buffer validity

provider switching

debug provider

Daytona generated provider
```

---

# 59. FUZZ TESTING

Generate thousands of deterministic realistic HumanDefinitions.

Validate:

```text
no NaN
no Infinity
no invalid topology
no invalid indices
no impossible joints
no invalid weights
no catastrophic intersections
no missing landmarks
no GPU validation failures
```

Record failing seeds.

---

# 60. DO NOT PRIORITIZE THESE YET

Until Daytona Generated HD Head V0.1 works, do not spend significant development effort on:

```text
organs

advanced hair

advanced cloth

neural rendering

Gaussian splatting

photo-to-human

WebNN experiments

crowd rendering

advanced aging

large clothing library

new AI architecture

new animation import formats
```

These are future capabilities.

The project currently needs **human fidelity**, not more architectural acreage.

---

# 61. IMPLEMENTATION ORDER

Work in this exact general order:

```text
1. Audit current repository

2. Preserve existing architecture

3. DaytonaGeneratedHumanProvider

4. Daytona canonical head representation

5. Semantic regions

6. Anatomical landmarks

7. Human Shape Space integration

8. 10 identity controls

9. Shape coefficient solver

10. Corrective solver

11. Sparse morph compilation

12. Existing WebGPU integration

13. Basic skin

14. Real eye geometry

15. Existing facial expressions

16. Existing speech

17. Identity tests

18. Undo/redo tests

19. Localized edit visualization

20. Performance benchmark

21. Fuzz testing

22. HD BODY V0.1
```

---

# 62. AFTER THE HEAD

Once the head works:

```text
DAYTONA GENERATED HD HEAD
             ↓
DAYTONA GENERATED HD BODY
             ↓
Production Skeleton
             ↓
Skin Weights
             ↓
Pose Correctives
             ↓
Muscles
             ↓
Soft Tissue
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
Time Evolution
```

---

# 63. WHAT NOT TO DO

Do NOT solve visual quality by turning Daytona into:

```text
GLB Loader
+
Three.js
+
Blendshape Sliders
```

Do NOT solve human generation by requiring:

```text
MetaHuman
Ready Player Me
Mixamo
Blender
Unreal
external avatar API
uploaded mesh
```

These may become optional interoperability targets.

They must not become Daytona's foundation.

---

# 64. THE TECHNOLOGICAL GOAL

The target is not merely:

> Render a human in WebGPU.

The target is:

> Maintain a persistent semantic digital human and compile changes to that human into the minimum anatomical, deformation and rendering work required to produce the current visual result.

That is the Daytona architecture.

---

# 65. FINAL SYSTEM

The long-term system should converge toward:

```text
             NATURAL LANGUAGE
                    │
                    ▼
               AI DIRECTOR
                    │
                    ▼
             CHARACTER EVENT
                    │
                    ▼
             HUMAN DEFINITION
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     Identity    Anatomy      Timeline
        │           │           │
        └───────────┼───────────┘
                    ▼
           Dependency Graph
                    │
                    ▼
             Delta Compiler
                    │
                    ▼
          Anatomical Constraints
                    │
                    ▼
             Human Shape Space
                    │
                    ▼
           Coefficient Solver
                    │
                    ▼
            Corrective Solver
                    │
                    ▼
             Sparse Deltas
                    │
                    ▼
                WEBGPU
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
    Anatomy     Performance   Appearance

    Skeleton     Animation      Skin
    Muscle       Expression     Eyes
    Tissue       Speech         Hair
    Skinning     Motion         Clothing
    Physics      Gaze           Attachments

       └────────────┼────────────┘
                    ▼
             Human GPU Scheduler
                    │
                    ▼
            Daytona Renderer
                    │
                    ▼
             DIGITAL HUMAN
```

---

# 66. FINAL INVARIANTS

Never violate these:

```text
HumanDefinition + Identity + Constraints + History = Character.
```

```text
Mesh = compiled visual representation.
```

```text
AI modifies semantics, not vertices.
```

```text
Localized change = localized computation.
```

```text
Human.create() must not require an uploaded human.
```

```text
Daytona owns/generates its default canonical human.
```

```text
Imported models are optional interoperability.
```

```text
WebGPU is the primary high-performance compute/render path.
```

```text
The same persistent human remains modifiable during animation, speech and time evolution.
```

---

# 67. INSTRUCTIONS FOR EVERY FUTURE DEVELOPMENT SESSION

Before implementing a feature, ask:

1. Does this preserve HumanDefinition as the source of truth?

2. Does this work without requiring a user-uploaded human?

3. Does this preserve stable canonical topology?

4. Does it use CharacterEvent rather than inventing another mutation pathway?

5. Does it integrate with the Dependency Graph?

6. Can localized changes remain localized?

7. Does it preserve identity when identity should not change?

8. Can the state be undone/restored?

9. Does it work with GPU-resident state?

10. Does it move Daytona closer to a reusable SDK rather than a single demo application?

If the answer to any relevant question is NO, redesign the implementation before merging it.

---

# 68. IMMEDIATE ACTION

Inspect the current repository against this mandate.

Produce:

```text
ALIGNED AND KEEP

ALIGNED BUT NEEDS EXTENSION

CONFLICTS WITH NO-UPLOAD GOAL

MISSING FOR DAYTONA-GENERATED HUMAN

TECHNICAL DEBT

CURRENT HD FIDELITY BOTTLENECK

NEXT 10 IMPLEMENTATION TASKS
```

Then implement the highest-priority missing item.

Do not begin another broad subsystem until the Daytona Generated HD Head V0.1 path is functional.

The immediate objective is simple:

> `Human.create()` must produce Daytona's own genuinely human canonical head, with no user upload, and that head must be semantically modifiable through the existing HumanDefinition → DependencyGraph → ShapeSpace → Sparse WebGPU architecture.

Build toward that objective without compromising the larger SDK architecture.

What Daytona would give you

The finished SDK should let another application do something roughly this simple:

import { Human } from "daytona-webgpu-avatar";

const human = await Human.create({
  quality: "cinematic"
});

human.modify({
  age: 34,
  height: 1.82,
  "face.jaw.width": 0.63,
  "face.eye.spacing": 0.52,
  "body.muscularity": 0.58
});

human.setExpression("smile", 0.7);
human.lookAt(camera);
human.speak("Welcome to Daytona.");
human.playClip("walk");

And your SDK handles the human.

Not Unreal. Not a required uploaded GLB. Not a server rendering the character.

Your architecture is aiming for:

AI / Application
        ↓
HumanDefinition
        ↓
Human Compiler
        ↓
Anatomy + Identity + Shape Space
        ↓
Skeleton + Facial Rig + Animation
        ↓
Sparse/Localized GPU Updates
        ↓
WebGPU Compute
        ↓
Skin + Eyes + Hair + Clothing
        ↓
WebGPU Renderer
        ↓
HD Digital Human

Your current repository already has much of the machinery underneath that idea, including semantic state, dependency/delta compilation, GPU sparse morphing, GPU skinning, identity preservation, animation, facial controls, speech visemes and WebGPU rendering. The HD provider is also now procedurally constructing its own human rather than requiring an uploaded character.

Could it reach MetaHuman quality?

Architecturally, yes. Visually, not yet.

MetaHuman is a very high bar. Epic describes MetaHuman as a framework for fully rigged, photorealistic digital humans, with high-fidelity facial animation, body animation, hair, clothing and real-time rendering. Its current Animator stack can derive facial/body performance from video and audio, including audio-driven facial animation.

Daytona is trying to approach the problem differently.

MetaHuman:

MetaHuman asset
↓
Rig
↓
Animation
↓
Unreal Engine
↓
GPU renderer

Daytona:

Human semantic definition
↓
Human compiler
↓
Generated canonical human
↓
Shape/anatomy solver
↓
Persistent rig
↓
WebGPU compute
↓
WebGPU renderer

That's potentially much more interesting for the web.

WebGPU itself is absolutely suitable as the low-level foundation because it exposes both GPU rendering and GPU computation in the browser.

Animation would be part of the SDK

That's one of the strongest parts of the concept.

The human isn't supposed to be generated and then handed off to some unrelated animation system.

The runtime owns:

Skeleton
Skin weights
Inverse bind matrices
FK
IK
Animation clips
Animation blending
Pose correctives
Facial controls
Expressions
Gaze
Blinking
Speech
Visemes
Co-articulation
Breathing
Procedural motion
Secondary motion

So you could eventually have:

human.walkTo([4, 0, 8]);

human.lookAt(user);

human.speak("Good morning.");

human.gesture("wave");

while the SDK continuously renders the result.

And because the character is persistent state, you could theoretically do something much stranger:

human.speak("Watch this.");

human.modify({
  "face.jaw.width": 0.68
});

while the character is talking and moving.

The face shouldn't regenerate. Animation shouldn't restart. The skeleton shouldn't be replaced.

The delta compiler calculates what changed and updates the necessary GPU state.

That's an important distinction.

Lip sync would also be native

Your eventual speech pipeline should be:

Text
 ↓
TTS
 ↓
Audio
 ↓
Phoneme timing
 ↓
Viseme Solver
 ↓
Co-articulation
 ↓
Jaw
Lips
Tongue
Cheeks
 ↓
Expression blending
 ↓
WebGPU facial deformation

Then add:

emotion
blinking
gaze
micro-expressions
head movement
breathing
gestures

to make it a performance, rather than a mouth flapping to phonemes like a haunted animatronic.

MetaHuman itself uses sophisticated audio-driven facial animation and can incorporate things such as head motion, blinks and mood, so this is another area where Daytona needs serious engineering before claiming parity.

And yes, the SDK would render it

That's a critical part of your idea.

The finished Daytona SDK shouldn't merely generate geometry and tell the application:

Good luck. Here's 200,000 triangles.

It should own the human rendering pipeline.

Conceptually:

Daytona Renderer
│
├── Human Geometry
│
├── Morph Compute
│
├── GPU Skinning
│
├── Pose Correctives
│
├── Muscle/Tissue
│
├── Skin
│   ├── pigmentation
│   ├── pores
│   ├── wrinkles
│   ├── roughness
│   └── SSS
│
├── Eyes
│   ├── sclera
│   ├── iris
│   ├── pupil
│   ├── cornea
│   └── tear film
│
├── Hair
│
├── Clothing
│
├── Lighting
│
├── Shadows
│
├── LOD
│
└── Temporal reconstruction
│
▼
WebGPU

The host React/JavaScript/Lovable application would mostly decide where the human appears and what the human does.

Daytona does the ugly GPU sorcery underneath.

The AI part is also different from image generation

I would not have AI generate the actual human vertices.

Instead:

"Create a 35-year-old man, 6 feet tall, athletic build, narrow nose, strong jaw, short brown hair."

becomes:

AI
 ↓
HumanDefinition

age = 35
height = 1.83
muscularity = .63
bodyFat = .28

nose.width = .43
jaw.width = .67

hair.length = .14
hair.color = brown

Then Daytona's deterministic human engine builds the result.

That distinction matters enormously.

You can then tell it:

"Make him look ten years older."

and the AI generates a change, not another human.

Current Human
+
Age Event
↓
Human Dependency Graph
↓
Age Shape Changes
Skin Changes
Wrinkle Changes
Hair Changes
Soft Tissue Changes
↓
Same Person

That's much closer to the architecture you've been pursuing.

Is this technology that has never been used before?

Individual pieces are absolutely not new.

WebGPU isn't yours. Skeletal animation isn't new. Morph targets aren't new. Parametric humans aren't new. Procedural skin isn't new. SDF collision isn't new. GPU compute isn't new. Facial rigs aren't new. Semantic character parameters aren't new. Epic is itself pushing sophisticated digital-human creation, animation and performance systems.

I also would not claim nobody has ever combined similar techniques without a much deeper prior-art review.

What can be genuinely distinctive is the architecture you're assembling around them:

Human Definition Language
+
Human Dependency Graph
+
Human Delta Compiler
+
Human Shape Space
+
Identity Preservation
+
Anatomical Constraints
+
Sparse Human Deformation
+
GPU-resident Character State
+
Human-specific GPU Scheduler
+
Persistent Timeline
+
Prompt/API/Event control
+
Browser-native WebGPU rendering

Especially this idea:

A human is persistent semantic state, and Daytona continuously compiles changes in that state into the minimum anatomical and GPU work necessary to render the same person.

That's the part I'd protect and develop as the core invention.

The bigger opportunity

If you actually complete the architecture we've been designing, I wouldn't position it merely as:

"MetaHuman for WebGPU."

I'd position it as:

A browser-native digital-human runtime.

MetaHuman is currently a highly sophisticated digital-human framework centered around Unreal's ecosystem.

Your end goal could instead be:

React
Vue
Next.js
Vanilla JS
Web components
Games
AI assistants
Virtual agents
Training apps
Kiosks
Education
Simulations
Digital twins

all doing:

const human = await Human.create();

and getting an HD, animated, speaking, persistent, AI-controllable WebGPU human.

No Unreal runtime.

No mandatory human-model upload.

No server-side character rendering.

No regenerating the person whenever something changes.

That is the product worth finishing.

And the current priority plan is important precisely because you've already built enough architecture. Now the generated topology, shape space, skin, eyes, facial deformation, rigging and animation have to become good enough that someone sees the demo and stops caring how clever the architecture is because the human on the screen actually looks real.

Yes. That actually clarifies the end goal considerably.

You don't just want a WebGPU equivalent of MetaHuman. You want two layers working together:

World 1: a deterministic, photorealistic digital-human engine.

World 2: an AI-native semantic system that understands every controllable aspect of that engine.

The second part is what can make Daytona much more interesting as an SDK.

Your current HumanDefinition → CharacterEvent → DependencyGraph → DeltaCompiler → GPU architecture is already pointing in that direction. The README explicitly establishes the single mutation path and semantic state model.

AI should understand the human, not the renderer

Instead of teaching AI:

vertex 17382 = ...
bone matrix = ...
WGSL buffer offset = ...

give it a complete semantic vocabulary:

human.identity
human.anatomy
human.face
human.body
human.skin
human.eyes
human.hair
human.teeth
human.expression
human.voice
human.speech
human.pose
human.motion
human.clothing
human.attachments
human.behavior
human.environment
human.camera
human.rendering

And underneath each category, expose increasingly precise controls.

For example:

human.face.nose.width
human.face.nose.bridge.height
human.face.nose.bridge.width
human.face.nose.tip.projection
human.face.nose.tip.rotation
human.face.nose.alar.width
human.face.nose.nostril.width

AI understands those.

The human compiler understands how those parameters affect anatomy.

WebGPU understands how to execute the resulting computation.

That's a clean separation.

Make Daytona self-describing

This is something I'd add to your architecture.

Every Daytona parameter should carry metadata such as:

{
  id: 1042,

  path: "face.nose.tip.projection",

  type: "number",

  range: [-1, 1],
  default: 0,

  units: "normalized",

  description:
    "Controls forward projection of the nasal tip",

  semanticAliases: [
    "nose projection",
    "projected nose",
    "prominent nose tip"
  ],

  anatomicalRegion: "nose_tip",

  affects: [
    "nose_tip",
    "nose_alar_left",
    "nose_alar_right"
  ],

  identityImportance: 0.82,

  persistence: "identity",

  constraints: [...],

  dependencies: [...],

  gpuOffset: 81
}

Now an AI agent doesn't need special training to understand Daytona.

It can inspect the SDK's semantic schema.

That is powerful.

Then give AI discovery APIs

Eventually I would want:

Daytona.describe();

Daytona.capabilities();

Daytona.schema();

Daytona.searchProperties("nose");

Daytona.describeProperty(
  "face.nose.tip.projection"
);

Daytona.availableExpressions();

Daytona.availableMotions();

Daytona.availableMaterials();

Daytona.availableClothing();

Daytona.availableAttachments();

Then an AI coding agent can interrogate Daytona before doing anything.

For example:

const capabilities =
    Daytona.capabilities();

might return:

{
  "human": {
    "identity": true,
    "anatomy": true,
    "expressions": true,
    "speech": true,
    "animation": true
  },

  "rendering": {
    "webgpu": true,
    "webgl2": true,
    "skinSSS": true,
    "strandHair": true
  }
}

Now your SDK becomes machine-readable, not merely documented for humans.

Natural language then becomes compilation

Imagine someone writes:

Create a 42-year-old athletic woman, approximately 5'8", with a narrow oval face, prominent cheekbones, slightly hooded green eyes, a small upward-turned nose, shoulder-length wavy dark hair and subtle freckles.

AI translates that into:

HumanIntent
↓
Daytona Semantic Schema
↓
HumanDefinition patch
↓
Constraint validation
↓
Identity solver
↓
Anatomical shape solver
↓
Human Shape Space
↓
Correctives
↓
Sparse deformation
↓
WebGPU

Importantly, the AI doesn't need to know how to make a cheekbone out of triangles.

It only needs to know:

face.cheek.height
face.cheek.width
face.cheek.projection

Daytona handles the biology and mathematics.

But I would go considerably further

Make everything semantic.

Not just anatomy.

Skin
skin.pigmentation
skin.undertone
skin.freckles.density
skin.freckles.size
skin.pores.scale
skin.roughness
skin.oiliness
skin.wrinkles.forehead
skin.wrinkles.eyes
skin.scars[]
skin.moles[]
Eyes
eyes.iris.color
eyes.iris.pattern
eyes.pupil.size
eyes.sclera.tint
eyes.cornea.wetness
eyes.gaze.target
eyes.blink.rate
Hair
hair.scalp.length
hair.scalp.density
hair.scalp.curl
hair.scalp.wave
hair.scalp.frizz
hair.scalp.part
hair.scalp.color
hair.scalp.gray
Performance
performance.emotion
performance.expression
performance.gaze
performance.blink
performance.breathing
performance.posture
Speech
speech.text
speech.emotion
speech.intensity
speech.rate
speech.visemes
speech.coarticulation
Clothing
clothing.upper.type
clothing.upper.fit
clothing.upper.material
clothing.upper.color
Rendering

Even:

render.quality
render.skin.quality
render.eye.quality
render.hair.quality
render.shadow.quality
render.lighting

could become semantic.

Then AI controls the entire human pipeline without directly manipulating WebGPU.

Add a Human Capability Graph

This is one architectural addition I'd seriously consider.

You already have the Human Dependency Graph.

Create a separate:

Human Capability Graph

The Dependency Graph answers:

"What needs recomputing if this changes?"

The Capability Graph answers:

"What can Daytona do, and how do I ask it to do it?"

For example:

Human
│
├── Appearance
│   ├── Face
│   ├── Body
│   ├── Skin
│   ├── Eyes
│   └── Hair
│
├── Performance
│   ├── Expression
│   ├── Speech
│   ├── Gaze
│   └── Motion
│
├── Wardrobe
│
├── Attachments
│
├── Time
│
└── Rendering

Each capability declares:

inputs
outputs
constraints
examples
supported operations
relationships
availability
quality level

Now an AI can reason about Daytona dynamically.

And expose actions as machine-readable tools

Conceptually:

{
  "name": "modify_face",
  "description": "Modify persistent facial anatomy",
  "parameters": {
    "region": "...",
    "property": "...",
    "value": "..."
  }
}

Another:

{
  "name": "perform_expression",
  "description": "Apply temporary facial performance",
  "parameters": {
    "expression": "...",
    "intensity": "..."
  }
}

Another:

{
  "name": "speak",
  "parameters": {
    "text": "...",
    "emotion": "...",
    "intensity": "..."
  }
}

That makes Daytona naturally compatible with future agents and tool-calling systems.

Then AI coding becomes ridiculously simple

An AI building a React application could inspect Daytona and generate:

function Assistant() {
    const human = useDaytonaHuman({
        quality: "high"
    });

    useEffect(() => {
        human.prompt(
          "Create a friendly professional woman in her 40s"
        );
    }, []);

    return (
        <DaytonaHuman
            human={human}
            width="100%"
            height="100%"
        />
    );
}

The application developer doesn't need to understand WGSL, morph buffers, FACS, skinning, corneal refraction or the increasingly absurd number of things required to make a convincing eyeball.

This gives you the two worlds
                 HUMAN / AI WORLD

Natural Language
AI Agents
React
JavaScript
Automation
APIs
Simulation
Behavior

                       │
                       ▼

              DAYTONA SEMANTIC API

Human Capability Graph
Human Definition Language
Character Events
Self-Describing Schema

                       │
                       ▼

              HUMAN COMPILER WORLD

Identity Solver
Anatomical Solver
Human Shape Space
Constraint Solver
Dependency Graph
Delta Compiler
Motion Compiler
Speech Compiler

                       │
                       ▼

                 GPU WORLD

Sparse Morph Compute
Correctives
Skinning
IK
Physics
Hair
Cloth
Skin
Eyes
Lighting
LOD

                       │
                       ▼

                    WEBGPU

                       │
                       ▼

             PHOTOREALISTIC HUMAN

That's the architecture I'd pursue.

One thing I would change in the current completion plan

Don't add the implementation of more AI features right now.

But absolutely make every system you complete AI-describable from day one.

For every new property, expression, motion, material or capability, require:

stable semantic name
description
type
range
units
aliases
constraints
dependencies
persistence
identity importance
examples
capability category

That costs relatively little now.

Trying to bolt semantic understanding onto 800 undocumented parameters three years later is how software engineers discover exciting new varieties of suffering.

So your completion sequence becomes:

BUILD HUMAN SYSTEM
        +
DEFINE SEMANTICS
        +
REGISTER CAPABILITY
        +
TEST
        +
GPU IMPLEMENTATION

rather than:

BUILD EVERYTHING
↓
Someday teach AI what it means
Your eventual product becomes bigger than a renderer

Then Daytona isn't merely:

"WebGPU MetaHuman."

It's closer to:

An AI-native digital-human operating system for the browser.

The photorealistic human is one side.

The semantic intelligence is the other.

And between them is the important Daytona invention:

AI describes what the human should be or do. Daytona deterministically compiles that intent into persistent anatomy, appearance, performance and minimal GPU work.

That combination is much closer to the SDK you've been describing from the beginning.

 will this also allow uploading a photo to product a 3d realistic person

Yes. That can be one of Daytona's major input modes, without violating your no-upload architecture.

The important distinction is: a photo should be an optional way to create the HumanDefinition, not a required asset that Daytona renders directly.

The pipeline should be:

Photo(s)
   ↓
Photo Analysis
   ↓
Face / Body Observations
   ↓
Landmarks + Proportions
   ↓
Identity Estimator
   ↓
Daytona Shape Coefficients
   ↓
HumanDefinition
   ↓
Anatomical + Identity Constraints
   ↓
Daytona Canonical Human
   ↓
Shape Space + Correctives
   ↓
Skin / Eye / Hair Appearance
   ↓
WebGPU
   ↓
Rigged 3D Person

So if someone uploads a portrait, Daytona does not create some unrelated photogrammetry mesh. It reconstructs that person's appearance using the same canonical Daytona human.

That gives you a huge advantage.

One photo

A single front-facing photo could estimate things like:

face proportions
eye spacing
eye shape
nose dimensions
jaw/chin structure
mouth/lip proportions
cheek structure
skin tone
freckles/moles
approximate age features
iris appearance
eyebrows
hairline
hair color/style

Then Daytona solves:

observations
    ↓
HumanShapeSpace coefficients
    ↓
identity

Some properties, particularly depth, are ambiguous from one image, so Daytona should expose confidence rather than pretending cameras have suddenly learned clairvoyance.

For example:

{
  "face.nose.width": {
    "value": 0.47,
    "confidence": 0.96
  },

  "face.nose.projection": {
    "value": 0.58,
    "confidence": 0.54
  }
}
Multiple photos make it considerably better

You could support:

Front
+
Left profile
+
Right profile
+
3/4 view
+
Optional full body

Then:

Multi-view images
       ↓
Landmark correspondence
       ↓
Camera estimation
       ↓
2D → 3D constraints
       ↓
Shape-space optimization
       ↓
Identity fitting
       ↓
Texture/appearance estimation
       ↓
Daytona Human

Now nose projection, forehead depth, jaw shape, skull shape, ears and other depth-dependent anatomy become much easier to estimate.

The really important part: it stays a Daytona human

After reconstruction:

const daniel = await Human.fromPhotos(images);

you should still be able to do:

daniel.setExpression("smile", 0.8);

daniel.speak("Hello.");

daniel.walkTo([5, 0, 3]);

daniel.modify({
    "face.jaw.width": 0.64
});

daniel.prompt("Make my hair shorter.");

daniel.advanceTime({ years: 10 });

That's substantially more useful than creating a static 3D scan.

The reconstructed person automatically inherits:

Daytona topology
Daytona skeleton
Daytona skinning
Daytona facial rig
Daytona expressions
Daytona speech
Daytona animation
Daytona attachments
Daytona LOD
Daytona WebGPU renderer

because the photo reconstructed parameters, not a replacement mesh.

You can also extract appearance

Geometry alone won't reproduce someone's likeness.

You need two reconstruction branches:

                 PHOTO
                   │
         ┌─────────┴─────────┐
         ▼                   ▼

    GEOMETRY             APPEARANCE

landmarks               pigmentation
proportions             freckles
depth                   moles
shape coefficients      eyebrows
asymmetry               lip color
                        iris appearance
                        skin variation
         │                   │
         └─────────┬─────────┘
                   ▼
             Identity Model
                   ↓
             Daytona Human

That second branch is essential for likeness.

Two people can have surprisingly similar facial geometry and still look completely different because of pigmentation, eyebrows, eye appearance, hairline, skin characteristics and subtle asymmetry.

And this fits your AI-ready architecture extremely well

Eventually you could support all three creation modes:

// Default Daytona person
const a = await Human.create();

// Semantic creation
const b = await Human.fromPrompt(
  "Create a 40-year-old athletic man..."
);

// Identity reconstruction
const c = await Human.fromPhotos([
  frontPhoto,
  sidePhoto
]);

All three converge into:

HumanDefinition
+
IdentityVector
+
ShapeCoefficients
+
AppearanceDefinition

After that, the engine doesn't particularly care where the definition came from.

That's exactly the abstraction you want.

Video would be an even stronger input later

Once photos work:

5-10 second face video
        ↓
Multiple viewpoints
+
Expressions
+
Eye movement
+
Mouth movement
        ↓
Identity reconstruction
+
3D shape estimation
+
Facial calibration

That could potentially estimate not only someone's appearance but how their particular face deforms.

Then a short calibration video could help generate personalized:

smile
blink
jaw motion
lip motion
cheek movement
speech shapes

That gets very interesting for digital doubles.

But don't build this yet

Your current priority should remain:

Daytona Generated Human
        ↓
HD topology
        ↓
Shape Space
        ↓
Realistic skin/eyes
        ↓
Facial deformation
        ↓
Animation
        ↓
Speech
        ↓
CORE V1

Then add:

Photo → Daytona Human

If you build photo reconstruction before the underlying human can represent a face accurately, the reconstruction algorithm will correctly discover that it has nowhere useful to put the information. A very sophisticated camera feeding a mediocre face model merely produces a more precisely mediocre face.

So yes: photo-to-realistic-3D-person absolutely belongs in the long-term SDK, but as an optional identity reconstruction frontend feeding the exact same Daytona human compiler and WebGPU runtime.

look at where i am at now and let me know what i need to get all above in on sdk give full plan without changing what i got

I checked the current repository again, including the latest merge on September 3. You're further along than the README makes it look. The source tree now contains the HD provider, full-body skin generator, shape-space system, semantic regions/landmarks, GPU pipeline, skeleton, animation, facial/speech systems, physics prototypes, renderer, validation, and the existing AI prompt layer.

The latest implementation also added more realistic eye structure, including dedicated limbus and cornea part types, with tests, which is exactly the sort of fidelity work you need now. And your updated direction.md now contains the no-upload architecture mandate, so the design intent is properly recorded in the repository rather than living exclusively in our increasingly enormous conversation.

What you need now is not a rewrite. The following is the master expansion plan I'd use to take what exists and eventually get all the things we've discussed: photorealistic humans, MetaHuman-class aspirations, AI-native control, animation, speech/lip sync, photo reconstruction, persistent identity, and SDK-owned WebGPU rendering.

DAYTONA DIGITAL HUMAN SDK
MASTER COMPLETION & EXPANSION PLAN
Preserve the Existing Engine and Build the Full AI-Native Photorealistic Human Platform

Repository:

CityofDaytonaBeach/DaytonaWebGPUAvatar

1. MISSION

Continue the existing DaytonaWebGPUAvatar architecture.

DO NOT restart the project.

DO NOT replace existing working systems.

DO NOT turn Daytona into a conventional GLB avatar viewer.

DO NOT require uploaded human geometry.

DO NOT abandon the existing semantic/event/GPU architecture.

The final objective is:

A browser-native, AI-ready, photorealistic digital-human SDK that creates, modifies, animates, speaks, reconstructs and renders persistent humans using Daytona's own semantic human representation and WebGPU runtime.

The SDK should eventually support:

const human = await Human.create();

const generated = await Human.fromPrompt(
  "Create a professional woman in her 40s with brown eyes"
);

const reconstructed = await Human.fromPhotos([
  frontPhoto,
  profilePhoto
]);

human.modify(...);

human.prompt(...);

human.setExpression(...);

human.lookAt(...);

human.speak(...);

human.walkTo(...);

human.wear(...);

human.advanceTime(...);

human.undo();

human.redo();

human.serialize();

All three creation methods:

Human.create()

Human.fromPrompt()

Human.fromPhotos()

must converge into the SAME Daytona human representation.

2. THE FUNDAMENTAL MODEL MUST REMAIN

Never change this:

CHARACTER != MESH

The Daytona character is:

HumanDefinition
+
IdentityVector
+
ShapeCoefficients
+
AppearanceDefinition
+
Constraints
+
Timeline
+
Performance State
+
Attachments

The mesh is compiled output.

3. PRESERVE THE CURRENT PIPELINE

Continue using:

CharacterEvent
      ↓
HumanDefinition
      ↓
IdentitySolver
      ↓
ConstraintSolver
      ↓
DependencyGraph
      ↓
DeltaCompiler
      ↓
HumanShapeSpace
      ↓
CorrectiveShapeSolver
      ↓
SparseMorph
      ↓
WebGPU

Do not introduce competing state systems.

4. CURRENT SYSTEMS ARE FOUNDATIONS

The repository already contains substantial systems.

Preserve and mature:

HumanDefinition
schema compiler

CharacterEvent
Human API

DependencyGraph
DeltaCompiler
DirtyRegionTracker

IdentitySolver
ConstraintSolver

Timeline
undo
redo
snapshots

CanonicalHumanProvider
DebugBlockHumanProvider
HDCanonicalHumanProvider

HD body skin
HD head

semantic regions
landmarks

HumanShapeSpace
ShapeBasis
ShapeCoefficientSolver
CorrectiveShapeSolver

SparseMorphSet
MorphDriver
MorphKernel

parametric anatomy
skeleton
FK
inverse-bind skinning
GPU skinning

skeletal animation
facial expression
speech/visemes
motion compiler

attachments

hair prototype
clothing prototype
cloth prototype
SDF prototype
skin residual prototype

semantic LOD
perceptual LOD

WebGPU renderer
WebGL2 fallback

profiler
validation

prompt interpreter

The project is now primarily an integration/fidelity problem.

5. MASTER ARCHITECTURE

Long-term Daytona should converge on:

                 INPUT LAYER

 Prompt
 Photos
 Video
 UI
 JavaScript
 AI Agent
 Automation
 API
 Simulation

                    │
                    ▼

              INTENT LAYER

 HumanIntent
 CharacterEvent
 Human Capability Graph

                    │
                    ▼

              SEMANTIC LAYER

 HumanDefinition
 IdentityVector
 AppearanceDefinition
 PerformanceDefinition

                    │
                    ▼

              HUMAN COMPILER

 Constraint Solver
 Identity Solver
 Dependency Graph
 Delta Compiler
 Shape Space
 Corrective Solver
 Motion Compiler
 Speech Compiler

                    │
                    ▼

             HUMAN RUNTIME

 Skeleton
 Skinning
 Facial Rig
 IK
 Muscle
 Tissue
 Physics
 Attachments
 Timeline

                    │
                    ▼

              WEBGPU COMPUTE

 Shape
 Morph
 Skinning
 Correctives
 Hair
 Cloth
 Tissue
 Normals
 LOD

                    │
                    ▼

              DAYTONA RENDERER

 Skin
 Eyes
 Teeth
 Hair
 Clothing
 Lighting
 Shadows
 SSS
 Temporal Reconstruction

                    │
                    ▼

          PHOTOREAL DIGITAL HUMAN
PART I
FINISH THE HUMAN FIRST
6. PHASE 1 — CANONICAL HUMAN V0.2

Current:

HDCanonicalHumanProvider

must evolve into the production Daytona human generator.

Do not remove it.

Improve it.

7. KEEP PROVIDER ABSTRACTION

Maintain:

CanonicalHumanProvider
│
├── DebugBlockHumanProvider
│
├── HDCanonicalHumanProvider
└── ImportedHumanProvider [future optional]

Eventually rename or alias production provider:

DaytonaGeneratedHumanProvider

if desired.

Do not break existing provider APIs unnecessarily.

8. HD PROVIDER RESPONSIBILITIES

Production provider eventually supplies:

stable topology
semantic regions
landmarks
UVs
normals
tangents

skeleton
skin weights
inverse bind data

head
body

eyes
cornea
iris
pupil
limbus

teeth
gums
tongue
mouth cavity

eyelashes
eyebrows
nails

Hair and clothing remain separate systems.

9. PRODUCTION FACE TOPOLOGY

Improve facial topology around:

forehead
brow
eyes
eyelids
nose
nostrils
cheeks
nasolabial region
lips
mouth corners
chin
jaw
ears
neck

Topology must support deformation.

Do not optimize exclusively for the neutral pose.

10. FACIAL EDGE FLOW

Create proper loops around:

eyes
mouth
nose
jaw

The face must survive:

smile
frown
blink
squint
speech
jaw opening
lip pucker
lip funnel
cheek raising
11. BODY TOPOLOGY

Complete deformation-friendly topology for:

neck
shoulders
chest
back
abdomen
pelvis

upper arms
elbows
forearms
wrists

hands
fingers

thighs
knees
calves
ankles

feet
toes
12. SEMANTIC REGIONS

Upgrade regions from simple labels into robust anatomical regions.

Each region should know:

vertex membership
triangle membership
surface area
adjacent regions
landmarks
LOD importance
identity importance
13. LANDMARK NETWORK

Expand toward approximately:

100+ meaningful landmarks

Do not chase a number merely to possess a number.

Cover:

skull
eyes
nose
mouth
jaw
ears

neck
shoulders
elbows
wrists
hands

pelvis
hips
knees
ankles
feet
PART II
HUMAN SHAPE SYSTEM
14. PHASE 2 — HUMAN SHAPE SPACE V1

The existing shape-space architecture becomes Daytona's central human-variation model.

Continue:

HumanDefinition
↓
ShapeCoefficientSolver
↓
HumanShapeSpace
↓
CorrectiveShapeSolver
↓
SparseMorph
15. BUILD SHAPE BASIS LIBRARY

Organize bases:

IDENTITY

BODY

AGE

ASYMMETRY

CORRECTIVES

POSE

EXPRESSION

Do not mix these concepts into one undifferentiated morph pile.

16. FACIAL IDENTITY PARAMETERS

Eventually support detailed parameters for:

head
forehead
brows
eyes
eyelids
nose
cheeks
mouth
lips
philtrum
jaw
chin
ears
neck

Target:

V0.1 = 10
V0.2 = 25
V0.5 = 50+
V1 = 100+ useful facial dimensions

Quality matters more than count.

17. BODY PARAMETERS

Support:

height
torso length

shoulder width

chest width
chest depth

waist
pelvis
hips

arm length
forearm length

hand size

leg length
thigh length
shin length

foot size

body fat
muscularity
18. CORRELATED ANATOMY

Never make semantic controls equivalent to raw scale operations.

Example:

jaw.width

should affect:

mandible
jaw angle
chin transition
masseter area
cheek transition
neck transition
19. COMBINATION CORRECTIVES

Create correctives for interacting identity dimensions.

Example:

wide jaw
+
narrow face

needs a transition corrective.

Use continuous activation.

PART III
ANATOMY AND RIG
20. PHASE 3 — PRODUCTION SKELETON

Expand the current skeleton gradually.

Target:

root

pelvis

multi-bone spine
chest
upper chest

multi-bone neck
head

eyes
jaw

clavicles
scapula controls

arms
twist bones
wrists

full fingers

hips
thigh twist
knees
shins
ankles

feet
toes
21. PARAMETRIC SKELETON

Skeleton placement must derive from anatomy.

HumanDefinition
↓
AnatomicalDimensions
↓
JointPlacementSolver
↓
Skeleton

Changing:

height
shoulder width
arm length
leg length

must move corresponding joints.

22. SKIN WEIGHTS

Improve skin weighting.

Create GPU/debug heat maps.

Validate:

shoulders
elbows
wrists
hips
knees
ankles
neck
jaw
fingers
23. DUAL-QUATERNION OPTION

Investigate dual-quaternion skinning for areas where linear blend skinning produces volume collapse.

Keep LBS available.

Benchmark both.

Do not switch merely because the mathematical name sounds expensive.

24. POSE-SPACE DEFORMATION

Add pose correctives for:

shoulder raise
arm raise
elbow bend
wrist bend
hip flex
knee bend
ankle bend
neck rotation
jaw opening
PART IV
MUSCLE AND SOFT TISSUE
25. PHASE 4 — MUSCLE APPROXIMATION

After basic rig quality works, add simplified muscle representation.

Pipeline:

Skeleton
↓
Muscle activation
↓
Muscle deformation
↓
Soft tissue response
↓
Skin
26. MUSCLE REPRESENTATION

Start with important visible groups:

deltoids
pectorals
biceps
triceps
forearms

trapezius
latissimus

abdominals

glutes
quadriceps
hamstrings
calves

Use:

capsules
ellipsoids
SDF primitives

before attempting full volumetric anatomy.

27. SOFT TISSUE

Add secondary deformation:

fat
skin
breast tissue
abdomen
cheeks
upper arms
thighs

Start with deterministic spring/PBD-style approximations.

PART V
PHOTOREAL FACE
28. PHASE 5 — FACIAL ACTION SYSTEM

Expand current facial expressions into a systematic facial rig.

Support:

brow inner up
brow outer up
brow down

blink
squint
eye wide

cheek raise

nose sneer

jaw open
jaw forward
jaw left/right

smile
frown

mouth stretch
press
roll
funnel
pucker

upper lip raise
lower lip depress
29. IDENTITY + EXPRESSION SEPARATION

Always:

Neutral Identity
+
Expression
+
Expression Corrective
=
Current Face

Expressions must never rewrite identity.

30. DYNAMIC WRINKLES

Drive wrinkle intensity from facial actions.

Example:

brow raise
↓
forehead wrinkles

squint
↓
crow's feet

smile
↓
nasolabial fold

Use displacement/normal detail rather than excessive base geometry.

PART VI
EYES
31. PHASE 6 — OPTICAL EYE SYSTEM

Continue current eye work.

The recent:

sclera
iris
pupil
limbus
cornea

structure is correct.

Expand it.

32. EYE SHADER

Implement:

corneal reflection
IOR/refraction approximation
iris depth
radial iris fibers
limbal ring
scleral roughness
subtle scleral vessels
wetness
pupil dilation
33. TEAR FILM

Add:

tear film
tear line
inner-eye wetness

These tiny details have disproportionate perceptual importance.

34. GAZE

Implement:

human.lookAt(target);

with:

eye rotation
vergence
head contribution
neck contribution

Then:

saccades
micro-saccades
blink coupling
PART VII
PHOTOREAL SKIN
35. PHASE 7 — DAYTONA SKIN SYSTEM

Separate:

MACRO
MESO
MICRO
OPTICAL
36. MACRO

Base anatomy and silhouette.

37. MESO
wrinkles
folds
scars
nasolabial folds
under-eye folds
38. MICRO
pores
fine wrinkles
skin grain
39. OPTICAL
pigmentation
melanin approximation
blood coloration
roughness
specular
oiliness
wetness
subsurface scattering
40. REGION-AWARE SKIN

Different skin zones behave differently.

Example:

nose = oilier

forehead = higher specular

cheeks = softer scattering

lips = wetter

ears = thinner/transmissive
41. PROCEDURAL MICRODETAIL

Generate deterministic:

pores
freckles
minor pigmentation
small veins
roughness variation
blemishes

from:

seed
age
skin parameters
anatomical region
PART VIII
HAIR
42. PHASE 8 — HAIR SYSTEM

Keep existing hair prototype.

Mature it.

Architecture:

Scalp
↓
Follicles
↓
Guide hairs
↓
WebGPU interpolation
↓
Hair clusters/strands
↓
Physics
↓
LOD
43. HAIR DEFINITION

Expose:

length
density
thickness
curl
wave
frizz
clumping
part
hairline
color
gray %
44. HAIR LOD

Close:

strands

Medium:

clusters/cards

Far:

simplified cards/shell
PART IX
CLOTHING
45. PHASE 9 — CLOTHING SYSTEM

Keep current clothing/cloth prototypes.

Mature after body deformation is stable.

Pipeline:

Body measurements
↓
GarmentDefinition
↓
Garment generation
↓
Fit
↓
Skinning
↓
Collision
↓
Cloth simulation
46. AI-READY GARMENTS

Expose:

type
fit
size
material
color
pattern
sleeves
length
PART X
SPEECH AND LIP SYNC
47. PHASE 10 — SPEECH PERFORMANCE

Upgrade existing viseme system.

Pipeline:

Text
↓
TTS
↓
Audio
↓
Phonemes
↓
Timing
↓
Visemes
↓
Co-articulation
↓
Jaw/lips/tongue
↓
Facial expression
48. CO-ARTICULATION

A phoneme depends on surrounding phonemes.

Implement:

previous
current
next

context.

Blend rather than switching mouth poses.

49. SPEECH EMOTION

Add:

neutral
happy
sad
angry
excited
calm

as performance modifiers.

50. SPEECH + EXPRESSION

Allow:

human.setExpression("happy", .6);

human.speak("Welcome.");

Speech must compose with expression.

PART XI
BODY ANIMATION
51. PHASE 11 — MOTION SYSTEM

Mature MotionCompiler.

Target semantic actions:

idle
stand
sit
walk
run
turn
reach
point
wave
grab
look
52. MOTION API

Eventually:

human.walkTo([4,0,8]);

human.lookAt(target);

human.gesture("wave");

human.sit(chair);
53. IK

Implement:

head IK
eye IK
arm IK
hand IK
leg IK
foot placement
pelvis adjustment
PART XII
AI-NATIVE SDK
54. PHASE 12 — SELF-DESCRIBING HUMAN SCHEMA

THIS should be designed while the human systems are being completed.

Do not postpone semantics.

Every property should expose metadata.

Example:

{
  id: 1042,

  path: "face.nose.tip.projection",

  type: "number",

  min: -1,
  max: 1,

  default: 0,

  description:
    "Controls forward projection of the nasal tip.",

  aliases: [
    "nose projection",
    "projected nose",
    "prominent nose"
  ],

  anatomicalRegion: "nose_tip",

  persistence: "identity",

  identityImportance: .82,

  dependencies: [...],

  constraints: [...],

  gpuOffset: 81
}
55. SEMANTICS FOR EVERYTHING

Apply this to:

anatomy
face
body
skin
eyes
hair
expression
speech
motion
clothing
attachments
rendering
56. HUMAN CAPABILITY GRAPH

Add a new system:

HumanCapabilityGraph

This does NOT replace DependencyGraph.

DependencyGraph answers:

What changes if X changes?

CapabilityGraph answers:

What can Daytona do?
57. CAPABILITY GRAPH STRUCTURE
Human
│
├── Identity
│
├── Anatomy
│
├── Appearance
│   ├── Skin
│   ├── Eyes
│   └── Hair
│
├── Performance
│   ├── Expression
│   ├── Speech
│   ├── Gaze
│   └── Motion
│
├── Wardrobe
│
├── Attachments
│
├── Time
│
└── Rendering
58. CAPABILITY METADATA

Each capability exposes:

name
description
inputs
outputs
constraints
examples
availability
quality level
related properties
supported operations
59. AI DISCOVERY API

Expose:

Daytona.capabilities();

Daytona.schema();

Daytona.searchProperties("nose");

Daytona.describeProperty(
  "face.nose.tip.projection"
);

Daytona.expressions();

Daytona.motions();

Daytona.materials();

Daytona.renderCapabilities();
60. MACHINE-READABLE TOOL DEFINITIONS

Generate AI tool schemas automatically.

Examples:

create_human

modify_anatomy

modify_appearance

set_expression

look_at

speak

perform_motion

wear_clothing

add_attachment

advance_time

Do NOT manually maintain these separately from the Daytona schema.

Generate them.

61. HUMAN INTENT

Create:

HumanIntent

as an AI-facing intermediate representation.

Example:

{
  "operation": "modify",
  "targets": [
    {
      "path": "face.nose.width",
      "intent": "narrower",
      "confidence": 0.93
    }
  ]
}

Then compile:

HumanIntent
↓
validated CharacterEvent

AI never bypasses CharacterEvent.

PART XIII
PROMPT TO HUMAN
62. PHASE 13 — HUMAN.FROMPROMPT()

Implement after semantic coverage becomes adequate.

Target:

const human = await Human.fromPrompt(
  "Create a tall athletic woman with brown eyes and shoulder-length black hair."
);
63. PROMPT PIPELINE
Prompt
↓
AI Interpreter
↓
HumanIntent
↓
Capability Graph
↓
Schema validation
↓
Constraints
↓
HumanDefinition
↓
Human Compiler
↓
WebGPU
64. PROMPT MODIFICATION

Then:

human.prompt(
  "Make her hair slightly longer and her jaw a little narrower."
);

AI emits PATCHES.

Never regenerate the human.

PART XIV
PHOTO TO 3D PERSON
65. PHASE 14 — PHOTO RECONSTRUCTION

Do this AFTER the human shape space can accurately represent diverse faces.

Do not build reconstruction before the target representation is capable enough.

66. PHOTO API

Target:

const human = await Human.fromPhotos([
  front,
  leftProfile,
  rightProfile
]);

Also support:

Human.fromPhoto(front);

with reduced reconstruction confidence.

67. PHOTO RECONSTRUCTION PIPELINE
Photo(s)
↓
Image normalization
↓
Face detection
↓
Landmarks
↓
Camera estimation
↓
Identity observations
↓
ShapeCoefficientSolver
↓
HumanShapeSpace
↓
Appearance estimation
↓
IdentitySolver
↓
HumanDefinition
↓
Daytona Human
68. DO NOT CREATE A RANDOM PHOTO MESH

Do NOT:

photo
↓
new arbitrary topology

Do:

photo
↓
Daytona identity parameters
↓
Daytona canonical topology

This means reconstructed humans automatically support:

animation
speech
expressions
attachments
clothing
LOD
WebGPU
69. PHOTO OBSERVATIONS

Extract:

face outline
eye position
eye size
eye angle

nose width
nose length

mouth width
lip thickness

jaw
chin

cheeks

ears

skin
eyebrows
hairline
70. MULTI-VIEW RECONSTRUCTION

Use:

front
profile
3/4

to solve depth.

Optimization objective:

Daytona projected landmarks
≈
photo landmarks

while maintaining anatomical constraints.

71. CONFIDENCE

Every estimated property should return confidence.

Example:

{
  "face.nose.width": {
    "value": .47,
    "confidence": .95
  },

  "face.nose.projection": {
    "value": .56,
    "confidence": .61
  }
}
72. APPEARANCE RECONSTRUCTION

Separate geometry and appearance.

PHOTO
├── Geometry
└── Appearance

Appearance estimates:

skin tone
undertone
freckles
moles
lip color
eyebrows
iris
hairline
hair color
PART XV
VIDEO TO DIGITAL DOUBLE
73. PHASE 15 — VIDEO RECONSTRUCTION

Later support:

Human.fromVideo(calibrationVideo);

Use multiple frames for:

identity
depth
expression calibration
facial movement
74. PERSONALIZED PERFORMANCE

A short calibration video may eventually estimate personalized:

smile response
blink
jaw movement
lip motion
cheek deformation

These become person-specific corrective coefficients.

PART XVI
RENDERING
75. PHASE 16 — DAYTONA PHOTOREAL RENDERER

The SDK must render its own humans.

Do not merely return geometry.

76. RENDER PIPELINE
Human GPU State
↓
Geometry
↓
Materials
↓
Lighting
↓
Shadows
↓
SSS
↓
Eyes
↓
Hair
↓
Clothing
↓
Post processing
↓
Temporal reconstruction
↓
Display
77. PBR

Support:

physically based materials
IBL
HDR environment
soft shadows
tone mapping
exposure
AO
78. TEMPORAL QUALITY

Implement:

TAA
temporal accumulation
stable hair
stable shadows
stable skin detail

Eventually investigate temporal super-resolution.

79. SELECTIVE HIGH QUALITY

Use PerceptualLOD.

Close talking face:

eyes = maximum
skin = maximum
mouth = maximum
hairline = high
hands = medium
feet = low
PART XVII
GPU ARCHITECTURE
80. PHASE 17 — GPU-RESIDENT CHARACTER

Keep hot state GPU-resident.

CPU sends:

events
parameters
animation state

GPU stores:

working geometry
morph data
skinning state
materials
simulation
81. HUMAN PARAMETER BUFFER

Generate GPU layout from schema.

HumanDefinition
↓
Schema Compiler
↓
HumanParameterBuffer
↓
WGSL

No duplicate hand-maintained layouts.

82. HUMAN GPU SCHEDULER

Continue existing scheduler.

Target frame budget:

16.67ms @ 60FPS

Every workload:

priority
estimated cost
actual cost
visibility
perceptual importance
deadline
83. DELTA EXECUTION

Main Daytona optimization:

Change
↓
DependencyGraph
↓
DeltaCompiler
↓
Affected ranges
↓
Minimal GPU work

Never silently regress into whole-character recomputation.

PART XVIII
AUTOMATION AND TIME
84. PHASE 18 — CHARACTER EVOLUTION

Keep timeline/event architecture.

Support:

human.advanceTime({
  years: 10
});
85. PROGRESSIVE STATE

Eventually model:

age
wrinkles
hair growth
gray hair
fitness
muscle
body fat
tan
86. AUTOMATION

External automation should generate CharacterEvents.

Example:

Every simulated day
↓
AdvanceTimeEvent
↓
HumanDefinition changes
↓
Delta compile
PART XIX
PERSISTENCE
87. PHASE 19 — DAYTONA HUMAN FORMAT

Create:

.dhuman

The package stores:

schemaVersion
topologyVersion
packageVersion

HumanDefinition
IdentityVector
AppearanceDefinition

shape coefficients

seeds

attachments
clothing

timeline
88. DO NOT STORE MESH AS CHARACTER

Mesh may be cached.

It must not be authoritative.

89. ROUNDTRIP

Require:

create
modify
save
destroy
load
compile

to reproduce the same person.

PART XX
VALIDATION
90. PHASE 20 — AUTOMATED HUMAN QA

Create standard cameras:

front
profile
3/4
back
full body
face
eyes
mouth
hands
feet
91. VALIDATE

Detect:

NaN
Infinity

degenerate triangles
bad normals

eye penetration
teeth clipping
tongue clipping

joint collapse
skin tearing

attachment drift

identity drift
92. FUZZ

Generate:

10,000+

seeded humans.

Test:

identity
shape
expression
pose
speech
combinations
PART XXI
PERFORMANCE
93. PHASE 21 — BENCHMARK

Measure:

FPS
CPU frame
GPU frame

shape solve
delta compile
morph
skin
physics
render

memory
94. LOCALITY REPORT

Every edit can report:

property
dependencies
regions
vertices
GPU passes
CPU time
GPU time
95. MULTI-HUMAN

Only after one human is excellent:

1
2
5
10
20

humans.

Share immutable data.

PART XXII
QUALITY LEVELS
96. PHASE 22 — QUALITY TIERS

Define:

CINEMATIC
HIGH
MEDIUM
LOW
COMPATIBILITY
97. CINEMATIC

Target:

maximum face
maximum eyes
SSS
high skin detail
strand hair
dynamic wrinkles
high shadow quality
98. COMPATIBILITY

Target:

WebGL2
reduced geometry
simple skin
hair cards
basic shadows

Identity remains the same.

PART XXIII
SDK DEVELOPER EXPERIENCE
99. PHASE 23 — SIMPLE API

Hide engine complexity.

Target:

const human = await Human.create();

human.prompt(...);

human.modify(...);

human.speak(...);

human.lookAt(...);

human.walkTo(...);

human.setExpression(...);

human.undo();

human.serialize();
100. FRAMEWORK INTEGRATIONS

After core SDK stabilizes:

Vanilla JavaScript
React
Vue
Next.js
Web Components

Keep framework wrappers thin.

Core engine remains framework-independent.

101. REACT

Possible future:

<DaytonaHuman
  human={human}
  quality="high"
/>

Do not put core human logic inside React.

PART XXIV
TESTING GATES
102. EVERY NEW HUMAN PARAMETER

Must have:

schema test
constraint test
dependency test
shape test
locality test
undo test
serialization test
103. EVERY NEW GPU KERNEL

Must have:

CPU reference
GPU parity test where possible
bounds validation
NaN protection
benchmark
104. EVERY NEW VISUAL SYSTEM

Must have:

fixed-camera validation
fixed-lighting validation
stress case
LOD behavior
performance measurement
PART XXV
DEVELOPMENT ORDER

Execute in this order.

CORE HUMAN
1 Canonical topology refinement

2 Facial topology

3 Eyelids

4 Mouth

5 Hands/feet

6 Semantic region quality

7 Landmark network
SHAPE
8 Shape Space 25 controls

9 Shape Space 50 controls

10 Body Shape Space

11 Combination correctives
DEFORMATION
12 Production skeleton

13 Skin weights

14 Pose correctives

15 Shoulder system

16 Muscle approximation

17 Soft tissue
FACE
18 Facial action system

19 Dynamic wrinkles

20 Eye optics

21 Gaze/blink

22 Skin renderer
PERFORMANCE
23 Speech co-articulation

24 Expression + speech composition

25 Motion compiler

26 IK
GPU/RENDER
27 Full GPU pipeline integration

28 GPU residency audit

29 Human GPU scheduler

30 Temporal rendering

31 Quality tiers
PERSISTENCE/QUALITY
32 Serialization

33 Device recovery

34 Visual validation

35 Geometry validation

36 Fuzz testing

37 Benchmarks
AI
38 Semantic metadata completion

39 HumanCapabilityGraph

40 AI discovery API

41 HumanIntent

42 Human.fromPrompt()
RECONSTRUCTION
43 Human.fromPhoto()

44 Human.fromPhotos()

45 Appearance reconstruction

46 Multi-view fitting

47 Video calibration
EXPANSION
48 Hair production

49 Clothing production

50 Cloth production

51 Aging/time evolution

52 Multi-human optimization

53 Framework wrappers
PART XXVI
MAJOR RELEASE MILESTONES
105. DAYTONA HUMAN V0.2

Must have:

good topology
25+ identity controls
body controls
skeleton
skinning
expressions
eyes
basic realistic skin
WebGPU
106. DAYTONA HUMAN V0.5

Must have:

50+ face controls
body shape space
pose correctives
better skin
better eyes
speech
gaze
basic motion
107. DAYTONA HUMAN V0.8

Must have:

production face
production body
production rig
FACS-like face
lip sync
IK
high-quality skin
hair
GPU optimization
serialization
108. DAYTONA CORE V1

Must support:

const human = await Human.create();

with no uploaded human.

Human can:

change identity
change body
smile
blink
look
speak
lip sync
walk
gesture
wear clothing
preserve identity
undo
save
reload

and is rendered by Daytona.

109. DAYTONA AI V1

Add:

Human.fromPrompt();

human.prompt();

Daytona.capabilities();

Daytona.schema();

AI can discover every supported semantic human capability.

110. DAYTONA RECONSTRUCTION V1

Add:

Human.fromPhoto();

Human.fromPhotos();

Photo identity becomes a normal Daytona human.

111. DAYTONA DIGITAL DOUBLE V1

Add:

photo/video reconstruction
personalized facial calibration
photoreal skin
photoreal eyes
high-quality hair
speech
animation
112. META-HUMAN-CLASS QUALITY GATE

Do NOT claim MetaHuman-class quality based on architecture.

Require visual evidence.

Test:

neutral close-up
smile close-up
speech close-up
blink
eye movement
profile
3/4
full body
walking
hand movement
cinematic lighting
neutral lighting

The quality target is:

photorealistic still
+
photorealistic deformation
+
photorealistic performance

A beautiful neutral screenshot alone does not pass.

PART XXVII
WHAT NOT TO CHANGE

Do NOT remove:

HumanDefinition
CharacterEvent
DependencyGraph
DeltaCompiler
IdentitySolver
ConstraintSolver
Timeline
SparseMorph
CanonicalHumanProvider
ShapeSpace
WebGPU architecture

These are the spine of Daytona.

113. DO NOT MAKE AI THE GEOMETRY ENGINE

Never:

LLM → vertices

Use:

LLM
↓
HumanIntent
↓
HumanDefinition
↓
Daytona Human Compiler
↓
geometry
114. DO NOT MAKE PHOTOS THE GEOMETRY ENGINE

Never:

photo
↓
random mesh

Use:

photo
↓
observations
↓
identity parameters
↓
Daytona Shape Space
↓
Daytona canonical human
115. DO NOT REQUIRE EXTERNAL HUMAN ASSETS

The SDK may contain its own:

topology data
shape basis data
skin data
animation data

But:

Human.create()

must not require application/user uploads.

PART XXVIII
THE FINAL PRODUCT

A future application should be able to do:

import {
  Human,
  DaytonaRenderer
} from "@daytona/human";

const person =
  await Human.fromPhotos([
    front,
    profile
  ]);

person.prompt(
  "Give her shoulder-length brown hair."
);

person.setExpression(
  "friendly"
);

person.lookAt(camera);

person.speak(
  "Welcome to the application."
);

person.walkTo([2, 0, 5]);

Daytona handles:

identity reconstruction

human shape

anatomy

skeleton

skin weights

face

eyes

skin

hair

expression

speech

lip sync

animation

IK

physics

LOD

GPU compute

rendering

history

serialization
116. THE TWO WORLDS

The final Daytona SDK combines:

WORLD ONE — PHOTOREAL DIGITAL HUMAN ENGINE
anatomy
shape
rig
skin
eyes
hair
clothing
animation
speech
physics
WebGPU

with:

WORLD TWO — AI-NATIVE HUMAN SEMANTICS
HumanDefinition
HumanIntent
CapabilityGraph
schema
natural language
photo observations
automation
APIs

Connected by:

SEMANTIC INTENT
        ↓
DETERMINISTIC HUMAN COMPILER
        ↓
MINIMAL GPU WORK
117. FINAL ARCHITECTURAL DEFINITION

Daytona is:

An AI-native, browser-native digital-human compiler and runtime that represents people as persistent semantic state and deterministically compiles changes in identity, anatomy, appearance and performance into localized GPU computation and photorealistic WebGPU rendering.

118. IMMEDIATE NEXT ACTION

Do NOT begin photo reconstruction yet.

Do NOT add another experimental rendering architecture.

Do NOT add another AI agent.

Start with:

CURRENT HD HUMAN
↓
Topology quality
↓
Shape quality
↓
Rig quality
↓
Skin quality
↓
Eye quality
↓
Facial performance
↓
Speech
↓
Motion
↓
Validation
↓
CORE V1

At the SAME TIME, make each completed property self-describing so the AI layer can consume it later.

For every completed feature:

BUILD IT
↓
DESCRIBE IT SEMANTICALLY
↓
REGISTER IT
↓
CONNECT DEPENDENCIES
↓
CONNECT GPU
↓
TEST IT
↓
BENCHMARK IT

This avoids having to retrofit AI semantics later.

119. FINAL RULE

Do not replace what already works.

Do not create parallel architectures.

Do not chase feature count.

Take each existing Daytona subsystem and graduate it:

PROTOTYPE
↓
INTEGRATED
↓
VALIDATED
↓
BENCHMARKED
↓
PRODUCTION

Only then move to the next dependency.

The objective is not to make a larger repository.

The objective is to make:

const human = await Human.create();

produce a human good enough that nobody looking at the screen cares how complicated the code behind it was.

Where you are right now

Based on the latest repository, I'd roughly classify you as follows:

Area	Current state	Destination
Semantic HumanDefinition	🟢 Strong	Production hardening
Event architecture	🟢 Strong	Keep
Dependency/delta compiler	🟢 Strong	Benchmark/locality
Identity/constraints	🟢 Strong foundation	Expand validation
Timeline/history	🟢 Strong	Serialization
Canonical provider architecture	🟢 Strong	Keep
Daytona-generated HD human	🟡 Active	Production topology
Shape Space	🟡 Active	Rich anatomical basis
Skeleton/skinning	🟡 Good foundation	Production rig/correctives
WebGPU morph/skinning	🟢 Strong foundation	Optimize
Eyes	🟡 Improving rapidly	Optical realism
Facial system	🟡 Foundation	FACS/correctives
Speech	🟡 Foundation	Co-articulation + performance
Skin	🟠 Prototype	Major fidelity work
Hair	🟠 Prototype	Production strands/clusters
Clothing/cloth	🟠 Prototype	Production later
Motion	🟠 Prototype	IK + motion library
AI semantics	🟡 Architectural foundation	Capability Graph
Prompt creation	🟠 Early	Full HumanIntent
Photo → human	🔴 Not yet	After Shape Space
Video → digital double	🔴 Future	After photos
Photorealism	🟠 Early	Major remaining challenge
MetaHuman-class visual quality	🔴 Not demonstrated	Long-term validation target

The newest commit confirms you're already moving into the right fidelity work. It added explicit limbus geometry and made corneas dedicated optical parts rather than treating them as sclera, with corresponding tests. Your current tree also confirms the shape-space architecture is present alongside the much broader runtime.

So I would freeze architectural invention for a while. Keep the future AI/photo/video interfaces in the master plan, but spend the next serious block of development making one Daytona-generated person look, deform, blink, speak and move exceptionally well. Once that representation is strong, AI and photo reconstruction have something powerful to control instead of being very sophisticated interfaces to a mediocre face.

