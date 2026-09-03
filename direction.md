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

