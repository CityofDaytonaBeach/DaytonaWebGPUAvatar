# MASTER ENGINEERING PROMPT: INVENT AND IMPLEMENT A BROWSER-NATIVE PROMPTABLE DIGITAL HUMAN ENGINE

## Mission

Design and implement a new browser-native digital-human technology from first principles.

The system must create, represent, modify, animate, simulate, preserve, and render high-definition digital humans using WebGPU as the primary GPU platform.

This is NOT simply:

- a character creator
- a collection of sliders
- a Three.js avatar viewer
- a GLB viewer
- a text-to-3D wrapper
- a MetaHuman clone
- a collection of morph targets
- an AI-generated mesh system
- an Unreal Engine replacement running through streaming
- a server-rendered avatar
- a static character generator

The objective is to invent a new **persistent semantic digital-human runtime**.

The central architectural principle is:

> THE CHARACTER IS NOT THE MESH.

The character is persistent structured state consisting of anatomy, identity, materials, attachments, animation state, history, relationships, constraints, and behavior.

The visible mesh is only one real-time representation compiled from that state.

The ultimate architecture should support:

```text
Prompt
UI
API
Automation
Simulation
Motion Capture
Speech
Animation
       │
       ▼
Human Definition
       │
       ▼
Human Compiler
       │
       ▼
Dependency / Constraint / Identity Systems
       │
       ▼
Delta Compiler
       │
       ▼
Human Compute Graph
       │
       ▼
GPU-Resident Character State
       │
       ▼
WebGPU Compute
       │
       ▼
Human-Specific Renderer
       │
       ▼
HD DIGITAL HUMAN
```

The same character must be continuously editable without regeneration.

---

# 1. FUNDAMENTAL REQUIREMENTS

Build the architecture from the beginning to support:

- realistic human anatomy
- skeleton
- joints
- muscles
- soft tissue
- optional internal organs
- skin
- eyes
- teeth
- tongue
- hair
- facial hair
- body hair
- nails
- tattoos
- scars
- makeup
- piercings
- jewelry
- clothing
- shoes
- accessories
- facial expressions
- skeletal animation
- facial animation
- speech/lip synchronization
- gaze
- blinking
- breathing
- gestures
- locomotion
- IK
- procedural animation
- motion capture
- animation retargeting
- progressive aging
- character history
- environmental changes
- automation
- prompt control
- external API control

Do not assume every subsystem must be completed immediately.

However, architecture created now MUST NOT prevent these capabilities from being implemented later.

---

# 2. NON-DESTRUCTIVE CHARACTER ARCHITECTURE

Every modification must be non-destructive.

A command such as:

"Make the nose 5% narrower."

must NOT regenerate the human.

It should produce something conceptually equivalent to:

```json
{
  "operation": "adjust",
  "path": "anatomy.face.nose.width",
  "multiply": 0.95
}
```

Only dependent systems should update.

For example:

```text
nose.width
    ↓
nose geometry
    ↓
nostril geometry
    ↓
nose corrective deformation
    ↓
nearby facial surface
    ↓
affected normals
```

The command should NOT unnecessarily modify:

```text
feet
hair
eyes
skeleton
clothing
hands
identity
```

unless a dependency requires it.

---

# 3. HUMAN DEFINITION LANGUAGE

Invent a versioned Human Definition Language, abbreviated HDL if appropriate.

This becomes the source representation of a character.

Do not begin by inventing complicated textual syntax.

Create a strongly typed schema that can serialize to JSON and eventually to an efficient binary representation.

Example concept:

```json
{
  "version": "1.0",

  "identity": {
    "id": "human_001",
    "seed": 839202
  },

  "anatomy": {
    "height": 1.78,
    "muscularity": 0.48,
    "bodyFat": 0.21,

    "face": {
      "jaw": {
        "width": 0.52,
        "projection": 0.47
      },

      "nose": {
        "width": 0.44,
        "length": 0.51
      }
    }
  },

  "skin": {},
  "eyes": {},
  "hair": {},
  "attachments": {},
  "clothing": {},
  "expression": {},
  "pose": {},
  "behavior": {}
}
```

Every HDL property should support metadata such as:

```text
ID
type
units
minimum
maximum
default
category
persistence type
identity importance
anatomical importance
dependencies
GPU location
LOD importance
animation capability
automation capability
```

Use stable numeric property IDs internally.

Do not make GPU systems perform string lookup.

---

# 4. SINGLE SOURCE-OF-TRUTH SCHEMA

Create one authoritative human schema.

From this schema automatically generate as much as possible:

```text
TypeScript types
runtime validators
JSON Schema
property IDs
dependency metadata
GPU buffer offsets
WGSL structures
serialization
deserialization
documentation
default values
constraint metadata
identity masks
dirty masks
LOD metadata
```

Avoid manually maintaining equivalent structures independently in TypeScript and WGSL.

Prevent CPU/GPU layout mismatch.

Build automated layout validation tests.

---

# 5. COMPLETE HUMAN PROPERTY HIERARCHY

The schema should be extensible enough to eventually describe:

## Global body

- height
- overall scale
- head/body ratio
- torso length
- arm length
- leg length
- shoulder width
- shoulder slope
- rib cage
- chest
- waist
- pelvis
- hips
- neck
- limb thickness
- body composition
- muscularity
- soft tissue
- posture
- asymmetry

## Skeleton

- root
- pelvis
- spine
- chest
- neck
- head
- clavicles
- shoulders
- upper arms
- elbows
- forearms
- wrists
- hands
- fingers
- hips
- thighs
- knees
- shins
- ankles
- feet
- toes

Support:

- joint limits
- IK
- twist bones
- corrective deformation
- retargeting
- parametric joint placement

## Head

- skull
- cranium
- forehead
- temples
- brow
- cheeks
- jaw
- chin
- nose
- mouth
- lips
- eyes
- eyelids
- ears
- teeth
- gums
- tongue

## Skin

- pigmentation
- base color
- roughness
- specular response
- micro-normal
- displacement
- thickness
- subsurface properties
- freckles
- moles
- scars
- wrinkles
- pores
- veins
- blemishes
- oiliness
- wetness
- temporary effects

## Hair

- scalp hair
- eyebrows
- eyelashes
- beard
- mustache
- stubble
- body hair

Properties:

- density
- length
- thickness
- curl
- wave
- frizz
- clumping
- direction
- part
- color
- highlights
- gray percentage

## Attachments

- tattoos
- scars
- makeup
- body paint
- piercings
- earrings
- necklaces
- rings
- watches
- glasses
- wearable devices

## Clothing

- garment type
- sizing
- fit
- layering
- material
- skinning
- cloth physics
- collision
- LOD

---

# 6. CANONICAL HUMAN MODEL

Create a canonical human representation.

Do NOT generate every person's topology independently.

All normal humans should derive from compatible canonical topology.

Requirements:

- stable vertex IDs
- stable anatomical regions
- stable facial loops
- animation-friendly topology
- predictable UVs or equivalent surface coordinates
- skeleton compatibility
- facial animation compatibility
- semantic anatomical landmarks
- attachment coordinates
- subdivision compatibility

Separate major geometry where appropriate:

```text
body
eyes
cornea
teeth
gums
tongue
eyelashes
hair
clothing
```

The canonical model must be capable of being transformed into many different people while preserving topology compatibility.

---

# 7. FROM-SCRATCH ANATOMICAL GENERATION

Do not simply deform random vertices.

Develop an anatomical generation model.

Conceptual pipeline:

```text
Human Definition
       ↓
Skeleton proportions
       ↓
Anatomical landmarks
       ↓
Muscle volumes
       ↓
Soft tissue
       ↓
Anatomical envelope
       ↓
Canonical surface fitting
       ↓
Corrective deformation
       ↓
Final surface
```

Investigate using simplified SDF or implicit volumes internally for anatomy.

However:

DO NOT simply render an SDF-generated human surface as the final character.

This commonly produces blob-like humans.

Use anatomical volumes to GUIDE or FIT canonical animation-friendly topology.

---

# 8. ANATOMICAL CONSTRAINT SOLVER

Create a constraint system preventing invalid humans.

Properties must not behave as completely independent sliders.

Example:

```text
upperArmLength
      ↓
elbow location
      ↓
forearm origin
      ↓
wrist position
```

Changing shoulder width should appropriately influence:

```text
clavicle
shoulder joint
upper torso
deltoid
arm placement
skin
clothing
```

Implement:

### Hard constraints

Impossible configurations.

### Soft constraints

Unusual but possible configurations.

### Dependency constraints

Properties derived from other properties.

### Corrective constraints

Surface corrections required when combinations interact.

Support constraint profiles:

```text
REALISTIC
STYLIZED
FANTASY
```

Realistic should enforce strong anatomical limits.

Stylized should relax them.

Fantasy should permit extreme modification while retaining topology stability where possible.

---

# 9. HUMAN DEPENDENCY GRAPH

Create a directed dependency graph.

Example:

```text
jaw.width
 ├─ mandible geometry
 ├─ facial muscle placement
 ├─ cheek transition
 ├─ neck transition
 ├─ skin deformation
 ├─ facial correctives
 └─ facial hair attachments
```

Every node should have:

```text
stable ID
inputs
outputs
dirty state
priority
GPU/CPU execution type
LOD importance
```

When a property changes, traverse only affected descendants.

Do NOT rebuild unrelated systems.

---

# 10. HUMAN DELTA COMPILER

Invent a Human Delta Compiler.

Input:

```text
Current Human State
+
Character Event
```

Output:

minimal required computation.

Example:

```text
INPUT

nose.width changed
```

Compiler output:

```text
affected parameters:
nose.width

affected geometry:
nose vertex ranges

affected compute:
sparse morph
corrective deformation
normal update

unaffected:
skeleton
hair
clothing
legs
hands
eyes
```

The compiler should eventually optimize multiple simultaneous changes.

For example:

```text
nose.width
jaw.width
smile
```

should combine overlapping work rather than dispatching redundant passes.

---

# 11. DIRTY REGION SYSTEM

Implement multiple levels of invalidation.

Potential hierarchy:

```text
character
body system
anatomical region
mesh range
vertex range
material region
simulation system
```

Examples:

```text
FACE = DIRTY
BODY = CLEAN
HAIR = CLEAN
```

Eventually support finer granularity:

```text
nose vertices = DIRTY
rest of face = CLEAN
```

Benchmark whether extremely fine dirty tracking actually improves performance.

Do not assume complexity is automatically faster.

---

# 12. HUMAN COMPUTE GRAPH

Create a compute graph representing required GPU operations.

Potential kernels:

```text
SparseMorphKernel
MorphAccumulationKernel
CorrectiveKernel
SkeletonKernel
SkinningKernel
MuscleKernel
SoftTissueKernel
NormalKernel
TangentKernel
SubdivisionKernel
SDFKernel
HairKernel
ClothKernel
AttachmentKernel
LODSelectionKernel
VisibilityKernel
```

The graph should:

- respect dependencies
- merge compatible work
- minimize CPU/GPU synchronization
- minimize dispatch count
- reuse buffers
- avoid unnecessary readback

---

# 13. GPU-RESIDENT CHARACTER STATE

Once a character loads, keep hot character state on the GPU whenever practical.

GPU-side state should eventually include:

```text
base vertices
working vertices
normals
tangents
UV/surface coordinates

bone transforms
skin weights

morph data
morph weights

corrective state

muscle state
soft tissue state

SDF collision fields

hair state
cloth state

material parameters

LOD state
visibility state
```

CPU-side state should primarily include:

```text
Human Definition
events
timeline
application logic
AI commands
persistent serialization
```

Do not continuously transfer complete meshes CPU ↔ GPU.

CPU sends small state changes.

GPU calculates resulting deformation.

---

# 14. HUMAN PARAMETER BUFFER

Create a compact GPU parameter representation.

The authoritative schema should generate the buffer layout.

Potential categories:

```text
global
skeleton
body
face
skin
eyes
hair
expression
animation
physics
LOD
```

Use storage/uniform buffers appropriately.

Investigate alignment requirements carefully.

Build automated tests confirming TypeScript and WGSL offsets match.

Support partial buffer updates.

---

# 15. SPARSE MORPH FORMAT

Invent a compact morph representation.

Do NOT assume every morph needs deltas for every vertex.

Example:

```text
noseWide
→ nose region

smile
→ lips + cheeks + eye region

bicepLarge
→ upper arm
```

Potential sparse entry:

```text
vertexID
deltaX
deltaY
deltaZ
```

Investigate:

- Float32
- Float16 where supported/appropriate
- signed 16-bit quantization
- signed 8-bit quantization
- local-region transforms
- delta prediction
- run-length/range encoding
- PCA
- deformation bases
- learned compression

The GPU should ideally decompress morph information directly.

Benchmark memory vs quality vs compute cost.

---

# 16. CORRECTIVE DEFORMATION

Morphs cannot simply be added indefinitely.

Implement corrective systems for combinations.

Examples:

```text
wide jaw + smile
large muscles + arm bend
large body mass + seated pose
aged face + expression
```

Begin with authored corrective functions/morphs.

Architect for future learned corrective prediction.

Correctives must preserve identity and anatomical plausibility.

---

# 17. IDENTITY PRESERVATION SOLVER

Create explicit character identity representation.

Identity should include weighted parameters describing distinctive structure.

Potential identity dimensions:

```text
skull proportions
jaw
cheeks
eye spacing
eye shape
nose
mouth
facial asymmetry
distinctive skin features
```

Every operation receives an identity-change budget.

Examples:

```text
"Make her tired"

identity budget:
NEAR ZERO
```

```text
"Make her nose narrower"

nose identity parameters:
EDITABLE

other identity:
LOCKED
```

```text
"Create a different person"

identity budget:
HIGH
```

Prevent unrelated identity drift.

Optionally investigate rendered-image identity validation later.

Do not make a neural embedding the only source of character identity.

---

# 18. HUMAN ATTACHMENT COORDINATES

Invent a stable anatomical attachment coordinate system.

Do NOT rely solely on world-space XYZ.

Support semantic references such as:

```text
human://skin/left_arm/forearm/anterior
human://ear/left/helix
human://face/right_eyebrow
```

For surface attachment, investigate:

```text
region ID
triangle ID
barycentric coordinate
normal offset
orientation
```

This should allow:

- tattoos
- scars
- piercings
- jewelry
- wearable sensors
- makeup
- decals

to remain attached while anatomy changes or animates.

---

# 19. TATTOO / SURFACE LAYER SYSTEM

Tattoos must not require permanently baking into the base skin texture.

Represent them independently.

Example:

```json
{
  "type": "tattoo",
  "region": "left_forearm",
  "surfaceCoordinate": {},
  "scale": 0.25,
  "rotation": 12,
  "opacity": 0.95
}
```

The tattoo must:

- follow skin deformation
- bend with joints
- survive body modifications
- be removable
- be resizable
- support history
- support automation

Use similar architecture for:

```text
scars
makeup
body paint
temporary marks
```

---

# 20. HUMAN-SPECIFIC SDF COLLISION FIELDS

Investigate approximate signed-distance fields for collision.

Possible fields:

```text
head
torso
left arm
right arm
left hand
right hand
left leg
right leg
feet
```

Use SDFs for broad collision involving:

```text
hair
cloth
jewelry
attachments
soft tissue
```

Use higher precision geometry only where necessary.

Support LOD-dependent SDF resolution.

SDF collision must NOT dictate final visible human topology.

---

# 21. MUSCLE AND SOFT-TISSUE SYSTEM

Architect:

```text
Skeleton
   ↓
Muscle approximation
   ↓
Soft tissue
   ↓
Skin
```

Initial implementation may use simplified muscle volumes and corrective deformation.

Future implementation should support:

- muscle contraction
- bulging
- skin sliding
- fat distribution
- soft-tissue secondary motion
- pose-dependent deformation

Avoid attempting expensive medical-grade simulation.

The objective is visually convincing real-time deformation.

---

# 22. HUMAN SEMANTIC LOD

Invent LOD specifically for humans.

Do not reduce the entire human uniformly.

Represent quality independently:

```text
face
eyes
skin
hair
hands
body
clothing
physics
shadows
```

Example:

```text
Face = 5
Eyes = 5
Skin = 5
Hair = 4
Hands = 3
Feet = 1
```

Each subsystem defines what its quality levels mean.

---

# 23. PERCEPTUAL LOD

Calculate quality from perceptual importance.

Investigate a score such as:

```text
importance =
screen coverage
× semantic importance
× camera focus
× motion importance
× lighting importance
```

Examples:

Close face:

```text
face HIGH
eyes HIGH
skin HIGH
feet LOW
```

Camera focused on tattoo:

```text
tattoo HIGH
arm skin HIGH
face MEDIUM
```

Full-body distant character:

```text
micro skin OFF
eye optics simplified
hair clusters/cards
cloth simplified
```

Avoid visible LOD popping.

Investigate smooth transitions/cross-fading.

---

# 24. HUMAN GPU SCHEDULER

Invent a human-specific GPU workload scheduler.

Target a configurable frame budget.

Example at 60 FPS:

```text
frame = 16.67ms
human target budget = approximately 10-12ms
```

Every system should provide:

```text
priority
estimated cost
dirty state
visibility
quality
deadline
```

Scheduler decides:

```text
execute
reduce quality
reuse previous result
defer
skip
```

Essential systems:

```text
visible animation
face
visible skin
```

Potentially reducible:

```text
hair physics
cloth physics
micro skin
shadow resolution
hidden attachments
```

Use WebGPU timestamp queries where supported to learn actual workload cost.

Maintain moving averages.

Adapt quality automatically.

---

# 25. SELF-BENCHMARKING GPU CONFIGURATION

At initialization, benchmark representative kernels.

Examples:

```text
morph
skinning
normal calculation
hair
texture bandwidth
SDF
subgroup operations where available
```

Select optimized settings per adapter.

Possible choices:

```text
workgroup size
buffer strategy
kernel variant
subgroup path
LOD defaults
hair mode
skin quality
```

Cache safe configuration information when appropriate.

Never assume one GPU configuration is universally optimal.

---

# 26. WEBGPU SUBGROUP OPTIMIZATION

Where available, investigate subgroup operations for:

```text
morph accumulation
reductions
normal calculations
visibility
LOD
hair clusters
collision candidates
```

Always maintain a normal WebGPU compute path.

Subgroup optimization must be optional.

Do not sacrifice portability for a benchmark trick.

---

# 27. PROCEDURAL SKIN SYSTEM

Separate skin detail into frequencies.

## Macro geometry

```text
skull
cheeks
nose
lips
jaw
muscle/body form
```

Represent primarily with geometry.

## Medium detail

```text
wrinkles
folds
scars
```

Represent through displacement/detail systems.

## Micro detail

```text
pores
tiny wrinkles
roughness variation
```

Generate procedurally where practical.

Inputs could include:

```text
skin region
age
seed
oiliness
pore density
orientation
environment
```

Procedural detail must be deterministic.

Same Human Definition + same seed must produce the same person.

---

# 28. NEURAL SKIN RESIDUAL

Architect an optional future neural correction layer.

Do NOT require neural rendering for basic operation.

Base:

```text
PBR
+
SSS approximation
+
procedural skin
```

Optional neural residual inputs:

```text
normal
view direction
light direction
skin thickness
roughness
region
base shading
```

Output:

```text
small shading residual
```

Final:

```text
physical shading + neural residual
```

The neural system should correct difficult appearance rather than generate the entire human.

---

# 29. EYE SYSTEM

Eyes are critical to avoiding uncanny characters.

Use separate structures for:

```text
eyeball
sclera
iris
pupil
cornea
limbus
tear line
tear duct
eyelids
```

Support:

- corneal bulge
- refraction approximation
- iris depth
- pupil dilation
- sclera variation
- wetness
- gaze
- saccades
- blinking
- eyelid contact

Create eye-specific LOD.

---

# 30. HAIR SYSTEM

Begin pragmatically.

Initial:

```text
hair cards / clusters
```

Future:

```text
scalp
→ follicles
→ guide curves
→ interpolated strands
→ clumps
→ physics
→ WebGPU rendering
```

Support:

- semantic hairstyle parameters
- growth
- length
- density
- curl
- color
- gray percentage
- wetness
- physics
- collision
- LOD

Hair must remain attached as skull/head shape changes.

---

# 31. FACIAL RIG

Build facial animation compatibility into the canonical human immediately.

Support an ARKit-compatible baseline or equivalent standardized control vocabulary.

Add higher-resolution custom controls.

At minimum architect:

```text
blink
squint
brows
eyes
cheeks
nose
jaw
mouth
lips
tongue
```

Identity and expression MUST remain separate.

Changing identity must not destroy expression capability.

---

# 32. MUSCLE-ORIENTED EXPRESSIONS

Semantic expression should not directly manipulate arbitrary vertices.

Example:

```text
smile = 0.6
```

should resolve into coordinated behavior:

```text
mouth corner movement
cheek raise
eye response
nasolabial deformation
lip deformation
dynamic wrinkles
```

Build semantic expression controls above low-level morph controls.

---

# 33. SPEECH AND LIP SYNCHRONIZATION

Architect speech from the beginning.

Pipeline:

```text
Text
 ↓
TTS
 ↓
audio
+
phoneme timing
 ↓
viseme solver
 ↓
co-articulation
 ↓
jaw
lips
tongue
cheeks
teeth visibility
 ↓
facial performance
```

Do not simply switch mouth shapes per phoneme.

Implement interpolation and co-articulation.

Speech should combine with:

```text
emotion
gaze
blinking
head movement
breathing
gestures
```

---

# 34. HUMAN MOTION COMPILER

Invent a semantic performance compiler.

Prompt:

"Walk toward the camera, stop, smile and explain the presentation."

AI should create a structured performance plan.

Example:

```json
{
  "sequence": [
    {
      "action": "walk",
      "target": "camera",
      "speed": 0.7
    },
    {
      "action": "stop"
    },
    {
      "action": "expression",
      "type": "smile",
      "intensity": 0.25
    },
    {
      "action": "speak",
      "text": "..."
    }
  ]
}
```

Compile this into:

```text
locomotion
animation clips
IK
gaze
expressions
gestures
speech
visemes
timing
```

The resulting performance should be deterministic and editable.

---

# 35. ANIMATION LAYERING

Support layered animation:

```text
base animation
+
IK
+
look-at
+
gesture
+
facial performance
+
speech
+
breathing
+
procedural motion
+
secondary physics
```

A walking animation must not prevent:

```text
turn head
wave
look at target
speak
change expression
```

---

# 36. ANIMATION INTEROPERABILITY

Architect import/retargeting support for:

```text
glTF animations
GLB
BVH-style motion
motion capture
ARKit facial data
external animation clips
future webcam tracking
```

Normalize external animation into the internal skeleton/facial control system.

---

# 37. PROGRESSIVE CHARACTER TIMELINE

Implement event sourcing.

The current human should be reconstructable from:

```text
Base Human
+
Character Events
+
Time
```

Example events:

```text
hair growth
aging
body composition change
new tattoo
new piercing
clothing change
scar
training progression
environmental exposure
```

Support:

```text
undo
redo
history
snapshots
branches
restore
replay
```

Create periodic snapshots to prevent replaying an unbounded number of events.

---

# 38. AUTOMATION-FIRST ARCHITECTURE

All character modifications should use ONE central event API.

Conceptually:

```text
applyCharacterEvent(event)
```

The following must all use it:

```text
AI
UI
automation
simulation
external API
timeline
developer tools
```

Do not create separate mutation systems.

This is critical.

---

# 39. TIME-BASED PARAMETER TRANSITIONS

Some changes are instant.

Example:

```text
shirt.color
```

Others are progressive.

Example:

```text
hair growth
aging
fitness
```

Create generalized transitions:

```text
property
start value
target value
start time
duration
curve
constraints
```

Support:

```text
linear
ease
biological/custom curves
```

The same system may control a 300ms smile or a 20-year aging transition.

---

# 40. CLOTHING

Clothing must be separate from body identity.

Architecture:

```text
body measurements
       ↓
garment fit
       ↓
garment geometry
       ↓
skinning
       ↓
collision
       ↓
cloth simulation
```

Changing body shape should update garment fit.

Support layered garments.

Use simplified simulation initially.

Architect more sophisticated cloth for later.

---

# 41. INTERNAL ANATOMY

Support optional modular internal anatomy:

```text
skeleton
muscles
major organs
circulation visualization
```

Do not load/render detailed organs during ordinary external character rendering.

Support modes:

```text
NORMAL
ANATOMY
SKELETON
MUSCLE
TRANSPARENT SKIN
```

Internal anatomy should be modular and lazily loaded.

---

# 42. HUMAN DELTA RENDERING

Investigate a rendering architecture based around state differences.

Instead of thinking:

"Render the entire human again."

Think:

"What changed?"

Maintain:

```text
Human State N
       ↓
Delta
       ↓
Human State N+1
       ↓
Dirty graph
       ↓
Required GPU work
```

Reuse previous computation where valid.

Do NOT blindly cache results if reuse would create visual artifacts.

Measure every optimization.

---

# 43. TEMPORAL REUSE

Investigate temporal reuse for:

```text
skin
hair
shadows
lighting
simulation
high-frequency detail
```

Use previous-frame data where mathematically safe.

Architect:

```text
current frame
previous frame
motion vectors
depth
normals
history validity
```

for future temporal reconstruction.

---

# 44. HUMAN-SPECIFIC RENDERER

Do not require a generic scene engine to own character rendering.

A general scene system may still handle environments.

Create specialized rendering paths for:

```text
skin
eyes
hair
teeth
mouth
clothing
```

Each path should have specialized shaders and LOD behavior.

---

# 45. SKIN RENDERING

Implement physically plausible skin using:

```text
base color
roughness
specular
normal
micro-normal
displacement
thickness
subsurface approximation
AO
```

Skin roughness must vary by anatomical region.

Avoid uniform plastic skin.

---

# 46. PERFORMANCE TARGETS

Create explicit performance targets.

Initial target:

```text
Desktop discrete GPU:
60 FPS

Modern integrated GPU:
30-60 FPS depending quality

Mobile WebGPU:
adaptive quality
```

Never hardcode "HD" as a polygon count.

Measure:

```text
GPU frame time
CPU frame time
VRAM estimates
buffer uploads
dispatch count
draw count
shader compilation
character update latency
```

---

# 47. CHARACTER MODIFICATION LATENCY

Create a benchmark specifically for prompt-driven modifications.

Example:

```text
nose width change
```

Measure:

```text
event processing
dependency traversal
delta compilation
CPU→GPU upload
GPU compute
visible result
```

Target near-immediate local changes.

The system should prove that localized modification costs substantially less than complete character regeneration.

---

# 48. PERFORMANCE TELEMETRY

Create a development profiler displaying:

```text
FPS
CPU frame time
GPU frame time
GPU memory estimate
active LOD
compute passes
draw calls
dirty regions
vertices modified
morph data processed
hair quality
cloth quality
skin quality
```

Add visualization for dirty regions.

This will be essential when validating the delta architecture.

---

# 49. DEVICE CAPABILITY PROFILES

At startup detect capabilities and select:

```text
CINEMATIC
HIGH
MEDIUM
LOW
COMPATIBILITY
```

Do not identify capability only by device name.

Use actual limits and benchmark results.

---

# 50. FALLBACKS

Primary renderer:

```text
WebGPU
```

Architect optional fallback:

```text
WebGL2
```

CPU-heavy utility work may use:

```text
WebAssembly
Web Workers
SIMD
threads where available
```

Do not make the entire architecture depend on WebGPU-only state that makes fallback impossible.

---

# 51. ASSET FORMAT

Use glTF/GLB as an interoperability format, not necessarily the internal runtime format.

Support:

```text
IMPORT
GLB
glTF
animations
textures

       ↓

INTERNAL HUMAN FORMAT

HDL
canonical topology
GPU buffers
sparse morphs
attachments
timeline
animation graph

       ↓

EXPORT
GLB/glTF
```

Investigate:

```text
MeshOpt
Draco
KTX2
Basis Universal
```

where appropriate.

---

# 52. INTERNAL BINARY FORMAT

Once the architecture stabilizes, design an optimized binary human package.

Possible contents:

```text
header
schema version
canonical topology reference
identity parameters
anatomical parameters
sparse morph data
skeleton
skin weights
surface layers
material definitions
hair definition
attachment definitions
animation data
timeline snapshot
```

Do not prematurely optimize this before the schema stabilizes.

---

# 53. DETERMINISM

Given:

```text
same engine version
same Human Definition
same seed
same asset package
```

the character should reproduce consistently.

Procedural systems must use seeded deterministic generation where practical.

This is necessary for:

```text
automation
history
multiplayer/synchronization
testing
character persistence
```

---

# 54. VERSIONING

Version:

```text
HDL
runtime
canonical topology
skeleton
binary package
shader set
```

Build migration support.

Characters created in earlier versions should not silently break after schema changes.

---

# 55. TESTING

Build automated tests for:

### Schema

- validation
- serialization
- migration

### Constraints

- parameter bounds
- anatomical relationships

### Identity

- unrelated changes do not modify identity parameters

### Dependency graph

- correct descendants become dirty

### Delta compiler

- minimal required systems execute

### GPU layout

- CPU/WGSL offsets match

### Morphs

- sparse decode accuracy

### Timeline

- deterministic replay

### Attachments

- remain attached after deformation

### Animation

- identity modifications do not destroy animation

### Performance

- localized modifications remain localized

---

# 56. VISUAL REGRESSION TESTING

Render standardized views:

```text
front
side
back
3/4 face
close face
full body
smile
blink
jaw open
arm raised
walking pose
```

Compare against approved reference renders.

Detect:

```text
geometry explosions
skin artifacts
eye errors
attachment movement
LOD errors
animation regressions
```

---

# 57. PERCEPTUAL VALIDATION

Architect a future optional visual validation system.

Pipeline:

```text
Generate/update human
       ↓
Render standardized views
       ↓
Visual evaluator
       ↓
anomaly detection
       ↓
correction suggestions
```

Potentially detect:

```text
eye alignment
bad proportions
mesh intersections
unnatural deformation
broken expressions
material errors
```

Do not allow an AI evaluator to directly mutate geometry.

It should create structured corrective requests processed through normal constraints.

---

# 58. PROMPT INTERPRETER

Natural language must NEVER directly write arbitrary vertices.

Pipeline:

```text
Prompt
 ↓
Intent interpretation
 ↓
Structured Character Event
 ↓
Schema validation
 ↓
Identity rules
 ↓
Anatomical constraints
 ↓
Dependency graph
 ↓
Delta compiler
 ↓
GPU
```

Example:

"Make him stronger."

AI may interpret:

```json
{
  "intent": "appearance.modify",
  "confidence": 0.71,
  "changes": {
    "anatomy.muscularity": 0.08,
    "anatomy.shoulderWidth": 0.02
  }
}
```

The engine, NOT the AI, decides whether those changes are valid.

---

# 59. AI CONFIDENCE

Prompt interpretation should include confidence.

Precise:

"Make the eyes blue."

High confidence.

Subjective:

"Make him heroic."

Lower confidence.

Low-confidence operations should make conservative changes unless explicitly instructed otherwise.

---

# 60. PATCH-BASED PROMPTING

AI should generate patches.

Example:

```json
{
  "operations": [
    {
      "op": "set",
      "path": "hair.length",
      "value": 0.7
    }
  ]
}
```

Do not regenerate the complete Human Definition for every prompt.

This prevents identity drift.

---

# 61. UNDO / REDO

Every mutation must be transactional.

Record:

```text
event ID
timestamp
source
property
previous value
new value
dependencies
```

Support:

```text
undo last
redo
undo only hair
restore face from version X
branch character
```

---

# 62. MULTIPLE CHARACTERS

Do not hardcode one human.

Architect character instances.

Shared GPU data:

```text
canonical topology
common shaders
common animation data
common morph basis
```

Per-character:

```text
parameters
identity
materials
hair
attachments
animation state
```

This could eventually make multiple humans substantially cheaper.

---

# 63. INSTANCED HUMAN RENDERING

Investigate shared canonical topology with per-character deformation state.

Goal:

```text
one canonical human asset
+
N Human Definitions
=
N distinct humans
```

Avoid duplicating immutable geometry unnecessarily.

---

# 64. HUMAN MEMORY OPTIMIZATION

Track memory explicitly.

Separate:

```text
shared immutable
per-character static
per-character dynamic
per-frame temporary
```

Pool GPU buffers.

Avoid frequent allocations.

Create buffer arenas/ring buffers where appropriate.

---

# 65. SHADER ARCHITECTURE

Avoid one monstrous shader containing every possible feature.

Create specialized pipelines.

Compile common variants asynchronously.

Cache pipelines.

Prevent shader compilation from causing visible interaction stalls.

---

# 66. GPU DEVICE LOSS

Handle WebGPU device loss gracefully.

Persistent character truth remains CPU-side:

```text
Human Definition
Timeline
Events
```

If GPU state is lost:

```text
new device
 ↓
recreate buffers
 ↓
restore human state
 ↓
resume
```

Never make GPU memory the only copy of persistent character information.

---

# 67. PROJECT STRUCTURE

Use a modular structure similar to:

```text
human-runtime/

core/
  definition/
  schema/
  events/
  timeline/

compiler/
  dependency/
  delta/
  compute/
  motion/

anatomy/
  skeleton/
  muscles/
  tissue/
  constraints/

identity/
  solver/
  masks/
  validation/

geometry/
  canonical/
  morph/
  subdivision/
  attachments/

physics/
  sdf/
  hair/
  cloth/
  collision/

gpu/
  buffers/
  kernels/
  scheduler/
  profiler/

render/
  skin/
  eyes/
  hair/
  mouth/
  clothing/
  lighting/

lod/
  semantic/
  perceptual/

animation/
  skeleton/
  ik/
  facial/
  speech/
  gestures/
  retargeting/

ai/
  prompt/
  events/
  director/

formats/
  gltf/
  human/
  hdl/

testing/
  unit/
  gpu/
  visual/
  performance/
```

Adapt this to the existing repository architecture where necessary.

---

# 68. DEVELOPMENT PHASES

Do not attempt everything simultaneously.

## PHASE 0: AUDIT AND ARCHITECTURE

Before coding:

1. Inspect the entire repository.
2. Identify current rendering technology.
3. Identify existing WebGPU implementation.
4. Identify current human/mesh implementation.
5. Identify reusable code.
6. Identify architectural conflicts.
7. Identify dependencies.
8. Identify browser requirements.
9. Produce an implementation map.
10. Then begin development.

Do not destroy existing working features unnecessarily.

---

# 69. PHASE 1: MINIMUM HUMAN COMPILER

Implement:

```text
Human Definition
Schema compiler
Property IDs
Human Parameter Buffer
Dependency Graph
Character Events
Delta Compiler
Basic WebGPU Compute
Sparse Morph prototype
```

Success test:

```text
Change nose width.
```

Requirements:

- only appropriate state changes
- only affected geometry recomputes
- GPU remains resident
- undo restores exact previous state
- identity remains stable

---

# 70. PHASE 2: CANONICAL HUMAN

Implement/import development canonical topology.

Requirements:

```text
stable vertex IDs
face loops
skeleton
weights
UVs/surface coordinates
eyes
mouth
teeth
tongue
```

It is acceptable during R&D to use a properly licensed development human asset.

However, isolate it behind the canonical-human interface so it can later be replaced with original topology.

Do not couple the runtime permanently to one third-party model.

---

# 71. PHASE 3: ANATOMICAL SYSTEM

Implement:

```text
parametric skeleton
anatomical landmarks
constraint solver
basic body proportions
basic facial proportions
corrective deformation
```

Test extreme combinations.

Prevent geometry collapse.

---

# 72. PHASE 4: IDENTITY

Implement:

```text
identity vector
identity masks
identity budgets
identity-preserving patches
```

Test:

```text
hair change
clothing change
expression change
pose change
```

None should alter underlying facial identity.

---

# 73. PHASE 5: FACIAL SYSTEM

Implement:

```text
facial controls
ARKit-compatible baseline
semantic expressions
correctives
blinking
gaze
jaw
tongue
```

Test:

```text
smile
frown
surprise
blink
speech mouth shapes
```

---

# 74. PHASE 6: SPEECH

Implement:

```text
phoneme timeline
visemes
co-articulation
expression blending
gaze
blinks
head micro-motion
```

Design TTS provider as an adapter.

The character runtime must not depend on one TTS vendor.

---

# 75. PHASE 7: MOTION

Implement:

```text
skeleton animation
IK
animation blending
look-at
gesture layering
motion compiler
retargeting
```

Prompt test:

"Walk forward, stop, look left and wave."

---

# 76. PHASE 8: SURFACE SYSTEMS

Implement:

```text
skin
procedural pores
wrinkles
tattoos
scars
makeup
piercings
attachments
```

Verify all surface attachments survive animation and body modification.

---

# 77. PHASE 9: HAIR AND CLOTHING

Implement practical first versions.

Hair:

```text
cards/clusters
```

Clothing:

```text
skinned garment
simple collision
simple secondary motion
```

Then evolve toward:

```text
GPU strands
advanced cloth
```

---

# 78. PHASE 10: SDF COLLISION

Implement body-region SDF collision.

Benchmark against alternatives.

Use only where it provides measurable value.

---

# 79. PHASE 11: SEMANTIC + PERCEPTUAL LOD

Implement human-specific quality selection.

Demonstrate:

```text
face closeup
full body
distant human
hand closeup
```

GPU work should redistribute accordingly.

---

# 80. PHASE 12: GPU SCHEDULER

Implement:

```text
frame budget
GPU timing
adaptive quality
work prioritization
deferred optional work
```

Target stable frame pacing rather than maximum theoretical quality.

---

# 81. PHASE 13: TIMELINE + AUTOMATION

Implement event sourcing.

Demonstrate:

```text
hair grows over time
character ages
tattoo added
clothing changes
body composition changes
```

Scrubbing the timeline should reproduce state deterministically.

---

# 82. PHASE 14: ADVANCED R&D

Only after the foundation works, investigate:

```text
learned deformation
neural corrective prediction
neural skin residual
Gaussian appearance detail
advanced soft tissue
advanced hair
neural super-resolution
foveated rendering
```

Each experiment must have a baseline comparison.

Do not keep experimental technology simply because it sounds sophisticated.

---

# 83. BENCHMARK-FIRST DEVELOPMENT

For every proposed innovation answer:

```text
What existing problem does this solve?

What is the baseline?

What metric improves?

How much memory does it require?

How much GPU time?

How much CPU time?

Does quality improve?

Does portability worsen?
```

Do not claim an optimization without measurements.

---

# 84. NO PLACEHOLDER SUCCESS

Do not report a subsystem as implemented if it is merely:

```text
empty function
TODO
fake mock
hardcoded output
console.log
UI with no engine implementation
```

Clearly label:

```text
IMPLEMENTED
PARTIAL
PROTOTYPE
PLANNED
```

Maintain a capability matrix.

---

# 85. NO SILENT FALLBACKS

If WebGPU functionality fails, expose the failure in development diagnostics.

Do not silently display a static fake human and report success.

---

# 86. RESEARCH MODE

When encountering a difficult problem:

1. Identify the actual mathematical/computational problem.
2. Review established approaches.
3. Determine why existing approaches are insufficient for this architecture.
4. Design an experiment.
5. Implement the smallest measurable prototype.
6. Benchmark.
7. Keep or reject it based on results.

Do not blindly install another dependency whenever a hard problem appears.

Dependencies should solve commodity problems.

Our own technology should solve the differentiating problems.

---

# 87. WHAT TO BUILD OURSELVES

Prioritize original implementation/research around:

```text
Human Definition Language

Human Schema Compiler

Human Dependency Graph

Human Delta Compiler

Human Compute Graph

Sparse Morph Format

Human Attachment Coordinates

Human Semantic LOD

Perceptual Human LOD

Human GPU Scheduler

Human Parameter Buffer generation

Human Motion Compiler

Anatomical Constraint Solver

Identity Preservation Solver

Progressive Character Timeline

GPU-resident character runtime

Procedural skin system

Optional neural skin residual

Human-specific SDF collision fields

Human Delta Rendering

Human GPU profiling/benchmarking
```

These are core differentiators.

---

# 88. WHAT WE SHOULD NOT NEEDLESSLY REINVENT

Use standards and proven mathematics where appropriate:

```text
WebGPU
WGSL
WebAssembly
glTF/GLB
KTX2
Basis Universal
MeshOpt
Draco where beneficial
PBR mathematics
quaternions
matrix math
skeletal animation principles
IK principles
ARKit-compatible facial vocabulary
```

Innovation should occur where it creates measurable advantage.

---

# 89. ULTIMATE CHARACTER API

Design toward something conceptually similar to:

```typescript
const human = await Human.create(definition);

human.modify(...);

human.setExpression(...);

human.setPose(...);

human.perform(...);

human.speak(...);

human.addTattoo(...);

human.addPiercing(...);

human.wear(...);

human.advanceTime(...);

human.undo();

human.redo();

human.snapshot();

human.restore(...);
```

And a universal event method:

```typescript
human.applyEvent(event);
```

Everything else should eventually resolve through this event architecture.

---

# 90. ULTIMATE PROMPT EXPERIENCE

The architecture should eventually support commands such as:

"Make her nose slightly narrower."

"Make him more muscular but preserve his face."

"Give her shoulder-length curly black hair."

"Add a small tattoo to her left forearm."

"Move the tattoo closer to her wrist."

"Remove the tattoo."

"Add a silver piercing to her left ear."

"Put her in a black business suit."

"Make the jacket slightly looser."

"Give her a subtle smile."

"Look toward the camera."

"Raise your right hand."

"Walk toward the desk."

"Say this sentence with a friendly expression."

"Keep speaking but become more serious."

"Grow his hair naturally for six months."

"Age her fifteen years."

"Return her face to the version from yesterday."

"Undo only the nose modifications."

"Hide the skin and show the skeleton."

"Show the muscular system."

Every operation must preserve unrelated state.

---

# 91. TARGET ARCHITECTURE

The final long-term architecture should resemble:

```text
             PROMPT / API / AUTOMATION
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
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      IDENTITY      ANATOMY       TIMELINE
       SOLVER       SOLVER         SYSTEM
          └─────────────┼─────────────┘
                        ▼
             HUMAN DEPENDENCY GRAPH
                        │
                        ▼
               HUMAN DELTA COMPILER
                        │
                        ▼
               HUMAN COMPUTE GRAPH
                        │
                        ▼
              GPU-RESIDENT STATE
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
     ANATOMY        PERFORMANCE       SURFACE
        │               │               │
    Skeleton         Animation         Skin
    Muscles          Expression        Hair
    Tissue           Speech            Tattoo
    SDF              Gaze              Clothing
        └───────────────┼───────────────┘
                        ▼
                  WEBGPU COMPUTE
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
      MORPHS         DEFORMATION       PHYSICS
      Sparse          Skinning         Hair
      Corrective      Muscles          Cloth
                      Normals          Collision
        └───────────────┼───────────────┘
                        ▼
                 PERCEPTUAL HLOD
                        │
                        ▼
                HUMAN GPU SCHEDULER
                        │
                        ▼
             HUMAN-SPECIFIC RENDERER
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
       SKIN            EYES            HAIR
      PBR/SSS         Optical         Strands
     Procedural       Layers          Clusters
        │               │               │
        └───────────────┼───────────────┘
                        ▼
              TEMPORAL RECONSTRUCTION
                        │
                        ▼
               HD DIGITAL HUMAN
```

---

# 92. CORE PERFORMANCE PHILOSOPHY

The system must exploit one fact generic renderers cannot exploit as aggressively:

> WE KNOW THE OBJECT IS A HUMAN.

Therefore the engine understands:

```text
where the face is
where the eyes are
where joints are
which regions matter perceptually
which geometry belongs to skin
which structures are hidden
which parameters represent identity
which parameters represent temporary performance
which changes affect which anatomy
```

Use this semantic knowledge to reduce unnecessary computation.

---

# 93. THE CORE INNOVATION

Do not frame the system as:

"Generate and render a human."

Frame it as:

> COMPILE A HUMAN STATE INTO THE MINIMUM GPU WORK NECESSARY TO PRODUCE THE CURRENT PERCEPTUAL RESULT.

That distinction should influence the entire architecture.

---

# 94. FIRST REQUIRED DEMONSTRATION

Before chasing photorealism, build a technical proof demonstrating:

1. Load one canonical rigged human.
2. Store character parameters in Human Definition.
3. Compile them into a GPU parameter buffer.
4. Keep geometry GPU-resident.
5. Change nose width.
6. Dependency graph identifies affected nodes.
7. Delta compiler identifies affected geometry.
8. WebGPU updates only necessary deformation.
9. Character identity remains unchanged elsewhere.
10. Undo restores the exact original state.
11. Display profiler data proving how much geometry and GPU work changed.

Then demonstrate:

```text
smile
jaw width
body muscularity
hair parameter
tattoo attachment
```

through the same event architecture.

If this works correctly, the foundational invention is viable.

---

# 95. SECOND REQUIRED DEMONSTRATION

Add animation.

The same character should:

```text
walk
look toward a target
blink
smile
speak using timed visemes
```

while retaining all previously modified anatomy.

Then modify appearance WHILE animation is running.

Example:

```text
Character speaking
       +
change hair
       +
change jacket
       +
modify nose
```

Animation must continue without character regeneration.

---

# 96. THIRD REQUIRED DEMONSTRATION

Demonstrate timeline evolution.

Create:

```text
Character Day 0
```

Then simulate:

```text
hair growth
body changes
aging
clothing change
new tattoo
```

Scrub backward.

The original character must reconstruct exactly.

Scrub forward.

The evolved character must reconstruct exactly.

---

# 97. ENGINEERING PRINCIPLES

Throughout implementation:

- Type everything.
- Validate everything.
- Measure performance.
- Avoid hidden global state.
- Keep persistent state separate from GPU cache.
- Keep identity separate from expression.
- Keep anatomy separate from clothing.
- Keep surface attachments independent.
- Keep AI outside geometry internals.
- Make every mutation transactional.
- Make changes deterministic where practical.
- Make GPU state reconstructable.
- Prefer standards for interoperability.
- Prefer custom technology where it produces measurable differentiation.
- Document experimental algorithms.
- Build benchmarks alongside implementation.
- Never sacrifice correctness merely to claim a feature is complete.

---

# 98. DEFINITION OF SUCCESS

This project succeeds when a digital human can exist as persistent structured state and be continuously manipulated through:

```text
prompts
UI
APIs
automation
animation
speech
simulation
timeline events
```

without regenerating the character.

The human should remain:

```text
recognizable
anatomically coherent
animation-compatible
reversible
deterministic
GPU-efficient
extensible
portable
```

while supporting increasingly photorealistic rendering.

---

# 99. LONG-TERM VISION

The ultimate system is:

> A browser-native, GPU-resident, persistent digital-human runtime that compiles semantic character state into minimal WebGPU computation and can continuously modify anatomy, appearance, clothing, attachments, expression, animation, speech, behavior, and time-dependent evolution without regenerating the character.

It should not merely compete with existing avatar generators.

It should investigate a different computational model:

```text
Human as semantic state
        +
Human as dependency graph
        +
Human as temporal history
        +
Human as GPU-resident computation
        =
Persistent programmable digital person
```

---

# 100. START NOW

Begin with Phase 0.

Inspect the existing repository completely before making architectural changes.

Then provide:

1. Current architecture assessment.
2. Reusable components.
3. Components that conflict with this architecture.
4. Proposed folder/module architecture.
5. Human Definition v0.1 design.
6. Human property ID strategy.
7. GPU buffer strategy.
8. Dependency graph design.
9. Delta compiler design.
10. WebGPU compute graph design.
11. Canonical-human requirements.
12. First benchmark plan.
13. First proof-of-concept implementation plan.
14. Risks and mitigations.
15. Exact implementation sequence.

After the assessment, begin implementing the foundation.

Do not reduce this project to a conventional 3D avatar creator.

Do not replace difficult systems with random vertex generation.

Do not generate humans as disconnected procedural blobs.

Do not allow the AI to directly manipulate geometry.

Do not rebuild the entire character for localized modifications.

Do not permanently bake modifications that should remain editable.

Do not tie animation to one character shape.

Do not make visual geometry the source of truth.

Build the system around this invariant:

**Human Definition + Constraints + Identity + History = Character.**

Everything visible is a compiled representation of that character.

The first objective is not "perfect graphics."

The first objective is proving that the underlying architecture can represent ONE human correctly, modify that human non-destructively, update only affected GPU state, preserve identity, animate the resulting character, and reconstruct any previous state deterministically.

Once that foundation is proven, progressively pursue photorealism, advanced anatomy, procedural skin, strand hair, cloth, neural residuals, learned deformation, advanced simulation, and additional experimental rendering technologies without breaking the character model underneath them.

EXPANDED:
At this point, what's remaining is less about inventing more architecture and much more about turning the prototypes into an actual HD human system.

Remaining work, in priority order
Priority Remaining Current state
🔴 P0 Real HD canonical human topology Procedural block prototype
🔴 P0 HD anatomical shape space Still needed
🔴 P0 Production facial topology Needs real geometry
🔴 P0 Production body topology Needs real geometry
🔴 P0 High-quality skin materials Prototype-level
🔴 P0 Realistic optical eyes Parts exist, realism needed
🔴 P0 Production morph dataset/basis Sparse system exists, data needed
🟠 P1 Production skeleton/weights Foundation implemented
🟠 P1 Pose-space correctives Needs expansion
🟠 P1 Muscle/soft-tissue deformation Needs serious implementation
🟠 P1 Full facial/FACS correctives Foundation exists
🟠 P1 Motion/behavior system Prototype
🟠 P1 Speech performance/co-articulation Visemes implemented
🟠 P1 Internal anatomy fidelity Prototype
🟡 P2 Hair Prototype
🟡 P2 Clothing Prototype
🟡 P2 Cloth physics Prototype
🟡 P2 SDF collision Prototype
🟡 P2 Tattoos Prototype
🟡 P2 Neural skin residual Prototype
🟡 P2 Perceptual validation/correction Prototype
🟡 P2 GPU timestamp benchmarking Prototype
🟡 P2 Localized benchmark suite Prototype
🟢 WebGPU rendering Implemented
🟢 WebGL2 fallback Implemented
🟢 Delta compiler Implemented
🟢 Dependency graph Implemented
🟢 Identity solver Implemented
🟢 Constraint solver Implemented
🟢 GPU sparse morphs Implemented
🟢 GPU skinning Implemented
🟢 Semantic/perceptual LOD Implemented
🟢 Timeline/history Implemented
🟢 Prompt patch system Implemented
🟢 Attachment coordinates Implemented

Your own current capability matrix agrees with this picture.

1. The big remaining piece is now extremely clear

You need:

CanonicalHumanHD

Your current README still says:

Canonical human (procedural block, replaceable) | PROTOTYPE

But importantly, you now have:

Canonical topology validation | IMPLEMENTED
Canonical topology asset adapter | IMPLEMENTED

Excellent architectural move.

That means you don't need to rewrite your engine to introduce HD geometry.

You can essentially go:

DebugBlockHuman
↓
CanonicalTopologyAdapter
↓
Daytona Human HD

while retaining:

HumanDefinition
DependencyGraph
DeltaCompiler
SparseMorph
Skeleton
IdentitySolver
Constraints
Timeline
Attachments
WebGPU

That's exactly what I'd want.

2. Build the Human Anatomical Shape Space

This is now the biggest missing algorithmic system.

Create something like:

src/anatomy/shape-space/

HumanShapeSpace.ts
FaceShapeBasis.ts
BodyShapeBasis.ts
SkullShapeBasis.ts
SoftTissueBasis.ts
AgeShapeBasis.ts

ShapeCoefficientSolver.ts
ShapeConstraintSolver.ts
ShapeCorrectiveSolver.ts

SparseBasisEncoder.ts
SparseBasisDecoder.ts

The pipeline becomes:

HumanDefinition

      ↓

Semantic Anatomy Parameters

      ↓

Anatomical Constraint Solver

      ↓

Identity Preservation Solver

      ↓

HUMAN SHAPE SPACE

      ↓

Shape coefficients

      ↓

Corrective Shape Solver

      ↓

Sparse deformation

      ↓

WebGPU

That is the missing bridge between your very good semantic architecture and an actual realistic person.

3. Stop treating HD morphology as individual morph sliders

Eventually:

jaw.width = .73

cannot merely activate:

jawWidthMorph * .73

It should solve correlated anatomy.

For example:

jaw.width
↓
mandible width
gonial angle
masseter placement
chin relationship
cheek transition
mouth relationship
under-chin tissue
neck transition
skin surface
facial hair anchors

And your existing dependency graph is beautifully positioned to handle this.

Humans, annoyingly, refused to evolve as independent slider controls.

4. You need actual HD human data

This becomes unavoidable now.

The runtime can invent transformations.

It cannot magically know the exact topology of a photoreal human without a reference representation.

You need a canonical dataset containing approximately:

HD neutral body mesh
HD neutral head mesh

stable vertex IDs
stable topology
UVs
semantic vertex regions
anatomical landmarks

skeleton
joint positions
skin weights

facial expression shapes
identity shapes
body shapes
pose correctives

eye geometry
teeth
gums
tongue
eyelashes

Later you can develop your own procedural/statistical generation of that data.

But v1 should load excellent source geometry through the adapter you just built.

5. Skin becomes a major project

You'll need a dedicated Daytona skin renderer.

Something roughly:

Skin Base +
Melanin/pigmentation +
Blood coloration +
Thickness +
Subsurface scattering +
Roughness variation +
Specular +
Pore field +
Micro normal +
Wrinkle field +
Displacement +
Dynamic expression wrinkles +
Age effects +
Environmental effects

I would explicitly separate frequencies:

MACRO
geometry

MESO
displacement

MICRO
normal/procedural skin

OPTICAL
shader/SSS

Don't put pores into a million extra vertices because apparently GPUs haven't suffered enough.

6. Eyes need their own renderer

Eyes will expose a fake human immediately.

Build:

EyeSystem

Sclera
Iris
Pupil
Cornea
Anterior chamber
Limbus
Tear film
Tear line
Eyelid contact

Then:

GazeSolver
BlinkSolver
SaccadeSolver
PupilSolver

Eyes should remain anatomically attached while facial geometry changes.

7. Upgrade the skeleton

The parametric skeleton and GPU skinning are already implemented.

Now make it production-grade.

Move toward:

100+ transforms

spine chain
neck chain
jaw
eyes

clavicles
scapula
shoulder
arm twist
forearm twist
full hands

pelvis
hip
thigh twist
knee
shin
ankle
foot
toes

But don't solve deformation with bones alone.

Use:

Skeleton +
Skinning +
Pose Correctives +
Muscle deformation +
Soft tissue 8. Muscle and tissue layer

This is probably your second-biggest R&D problem after Shape Space.

Eventually:

Skeleton Pose
↓
Muscle activation
↓
Muscle volume deformation
↓
Soft tissue response
↓
Skin

You don't need medically perfect finite-element simulation.

You need visually anatomically convincing deformation.

Simplified muscle primitives/SDFs are sufficient initially.

9. Finish your prototype systems

Your current capability matrix still labels these prototype:

Internal anatomy
Motion compiler
Time transitions
Tattoo projection
Clothing
Strand hair
SDF collision
Cloth physics
Neural skin residual
Localized benchmark
GPU timestamp benchmark
Perceptual validation

Don't rewrite them.

Graduate each:

PROTOTYPE
↓
HD integration
↓
GPU optimization
↓
validation
↓
stress testing
↓
production 10. Add automated visual validation

Your perceptual validator is currently prototype status.

Eventually every important character mutation should be testable from standardized cameras:

front face
left profile
right profile
3/4 face
full body front
full body side
hands
eyes
extreme expression
extreme pose

Check:

self-intersection
eye placement
mouth penetration
teeth clipping
joint collapse
broken silhouette
hair penetration
clothing penetration
asymmetry
identity drift
anatomical limits

That will become invaluable once you have hundreds of interacting parameters.

11. Make the benchmark prove your architecture

You added the GPU timestamp benchmark prototype. Good.

Finish it.

Your demo should eventually expose something like:

PROMPT
"Make his nose slightly narrower"

Semantic properties changed: 1
Dependencies affected: 7

Human vertices:
184,632

Vertices recomputed:
3,816

Percentage:
2.07%

GPU:

Shape solver 0.04 ms
Morph 0.05 ms
Corrective 0.02 ms
Normals 0.03 ms

Skin CACHED
Hair CACHED
Clothing CACHED
Body CACHED

Total update:
0.14 ms

Now you're not merely claiming your delta architecture works.

You're demonstrating it.

The remaining roadmap

I would now freeze new feature categories and execute:

DAYTONA HUMAN HD

PHASE A
Real canonical HD topology
↓
PHASE B
Human Anatomical Shape Space
↓
PHASE C
HD identity + body deformation
↓
PHASE D
Production skeleton + weights
↓
PHASE E
Pose correctives
↓
PHASE F
Skin + SSS + microstructure
↓
PHASE G
Optical eyes
↓
PHASE H
Full facial deformation
↓
PHASE I
Muscle + soft tissue
↓
PHASE J
Hair
↓
PHASE K
Clothing + collision
↓
PHASE L
Speech + motion performance
↓
PHASE M
Visual validation
↓
PHASE N
GPU optimization
↓
PHASE O
HD HUMAN V1
Bottom line

Architecturally, I'd estimate you've built most of the major runtime categories already. That does not mean you're 80% of the way to photorealism. The remaining 20-ish percent of categories contains perhaps 70% of the visual difficulty.

The architecture is no longer your main obstacle.

Human data, HD topology, anatomical shape solving, deformation quality, skin, eyes and hair are.

And that's actually a good place for this project to be. The plumbing is getting sophisticated enough that you can finally stop teaching the pipes philosophy and make them carry water.

give example of each item to implement and tell ai how to build it

Yes. At this point I'd give the coding AI a production-upgrade prompt, not another "build the architecture" prompt. Most of that architecture already exists. The instructions below tell it what each remaining system actually means, give a concrete example, and explain how to implement it without casually demolishing the rather useful engine you've already built.

DAYTONA WEBGPU AVATAR
HD HUMAN V1 IMPLEMENTATION MASTER PROMPT
OBJECTIVE

Continue development of the existing DaytonaWebGPUAvatar repository.

Repository:

CityofDaytonaBeach/DaytonaWebGPUAvatar

DO NOT restart the project.

DO NOT replace the existing architecture.

DO NOT convert this into a conventional avatar creator.

The repository already contains major architectural systems including:

Human Definition Language
property registry
numeric property IDs
dependency graph
delta compiler
dirty-region tracking
sparse morphs
GPU morph compute
GPU-resident rendering
GPU skinning
identity preservation
anatomical constraints
event-sourced timeline
attachments
semantic/perceptual LOD
WebGPU renderer
WebGL2 fallback
facial controls
speech/visemes
motion compiler prototype
SDF collision prototype
cloth prototype
hair prototype
skin residual prototype
topology validation
canonical topology adapter
GPU benchmarking foundation

The next objective is:

TURN THE EXISTING DIGITAL-HUMAN RUNTIME INTO DAYTONA HUMAN HD V1.

The current procedural block human must remain available as a debug/testing representation.

Create a new HD path beside it.

1. CANONICAL HUMAN PROVIDER ARCHITECTURE
   Problem

The current procedural block human is useful for testing but cannot represent a photorealistic person.

Do not delete it.

Build

Create an abstraction such as:

interface CanonicalHumanProvider {
load(): Promise<CanonicalHumanAsset>;

topologyVersion(): string;

validate(): CanonicalValidationResult;
}

Implement:

CanonicalHumanProvider
│
├── DebugBlockHumanProvider
│
├── HDHumanProvider
│
└── ImportedHumanProvider

The existing block human becomes the debug provider.

Example
const human = await Human.create({
canonicalProvider: new HDHumanProvider({
asset: "/humans/daytona-hd-v1.glb"
})
});

The rest of the runtime should not care whether the topology came from the debug human or HD human.

Acceptance criteria

Changing provider must NOT require changes to:

HumanDefinition
CharacterEvent
DependencyGraph
DeltaCompiler
Timeline
PromptInterpreter
IdentitySolver 2. HD CANONICAL TOPOLOGY
Goal

Introduce one high-quality neutral human topology.

This is the common topology from which normal human characters derive.

Requirements

The topology needs:

stable vertex IDs
stable triangle IDs
stable UV coordinates
semantic regions
anatomical landmarks
skeleton
skin weights
facial loops
mouth interior
eyes
eyelids
teeth
gums
tongue
ears
hands
fingers
feet
toes

Do not procedurally create the production human from cubes or spheres.

Example semantic regions
face.forehead
face.temple.left
face.temple.right

face.eye.left.upperLid
face.eye.left.lowerLid

face.nose.bridge
face.nose.tip
face.nose.alar.left
face.nose.alar.right

face.cheek.left
face.cheek.right

face.mouth.upperLip
face.mouth.lowerLip

face.jaw.left
face.jaw.right
face.chin

body.chest
body.abdomen
body.shoulder.left
body.shoulder.right

arm.left.upper
arm.left.forearm

hand.left
hand.right
Add semantic lookup structures

Conceptually:

interface SemanticRegion {
id: number;
name: string;

vertexRanges: VertexRange[];
triangleRanges: TriangleRange[];

importance: number;
}

Support non-contiguous ranges.

Do NOT assume every anatomical region occupies one contiguous vertex range.

3. ANATOMICAL LANDMARK SYSTEM

Create stable anatomical landmarks independent of world position.

Examples:

skull.top
skull.chin

eye.left.center
eye.right.center

nose.bridge
nose.tip
nose.alar.left
nose.alar.right

mouth.corner.left
mouth.corner.right

jaw.angle.left
jaw.angle.right

shoulder.left
shoulder.right

elbow.left
elbow.right

wrist.left
wrist.right

hip.left
hip.right

knee.left
knee.right

ankle.left
ankle.right

Represent landmarks through stable topology references where possible.

Example:

interface SurfaceLandmark {
id: number;
regionId: number;

triangleId: number;

barycentric: [number, number, number];

normalOffset: number;
}

Landmarks must survive morphing and animation.

4. HUMAN ANATOMICAL SHAPE SPACE

THIS IS ONE OF THE MOST IMPORTANT NEW SYSTEMS.

Create:

src/anatomy/shape-space/

Suggested files:

human-shape-space.ts
face-shape-basis.ts
body-shape-basis.ts
skull-shape-basis.ts
tissue-shape-basis.ts
age-shape-basis.ts

shape-coefficient-solver.ts
shape-corrective-solver.ts
shape-basis-loader.ts
shape-basis-encoder.ts
Purpose

Semantic properties should not directly manipulate vertices.

Instead:

HumanDefinition
↓
Semantic parameters
↓
ShapeCoefficientSolver
↓
Shape Basis
↓
Sparse deformation
Example

Input:

face.jaw.width = 0.70

DO NOT implement as:

vertex.x *= 1.2;

Instead solve:

jaw.width
↓
mandible width coefficient
gonial-angle coefficient
masseter-volume coefficient
cheek-transition coefficient
chin-transition coefficient
neck-transition coefficient

Then combine shape bases.

Conceptually:

FinalShape =
BaseShape +
Σ(identityBasis[i] × identityCoefficient[i]) +
Σ(bodyBasis[i] × bodyCoefficient[i]) +
Σ(ageBasis[i] × ageCoefficient[i]) +
Σ(correctiveBasis[i] × correctiveCoefficient[i]) 5. FACE SHAPE BASIS

Create a high-resolution facial identity system.

Start with perhaps 50-100 meaningful dimensions.

Architect for hundreds.

Examples:

Skull
skull.width
skull.height
skull.depth
forehead.height
forehead.slope
temple.width
brow.projection
Eyes
eyes.spacing
eyes.depth
eyes.size
eyes.rotation
eyes.upperLidShape
eyes.lowerLidShape
Nose
nose.width
nose.length
nose.projection
nose.bridgeWidth
nose.bridgeHeight
nose.tipWidth
nose.tipRotation
nose.alarWidth
nostril.width
nostril.height
Cheeks
cheekbone.width
cheekbone.height
cheekbone.projection
cheek.softTissue
Jaw
jaw.width
jaw.height
jaw.angle
jaw.projection
chin.width
chin.height
chin.projection
Mouth
mouth.width
mouth.position
upperLip.thickness
lowerLip.thickness
lip.projection
cupidsBow.shape
philtrum.depth
Ears
ear.size
ear.rotation
ear.projection
ear.lobeSize

Each semantic parameter can influence multiple basis vectors.

6. BODY SHAPE BASIS

Build a body shape space.

Example dimensions:

height
torso.length
leg.length
arm.length

shoulder.width
ribCage.width
ribCage.depth

waist.width
pelvis.width
hip.width

upperArm.volume
forearm.volume

thigh.volume
calf.volume

bodyFat
muscularity

abdomen.volume
chest.volume
glute.volume

Example:

"Make him more muscular"

should NOT simply scale the whole body.

It should produce something like:

deltoid +0.10
biceps +0.12
triceps +0.09
forearm +0.06
chest +0.08
latissimus +0.07
quadriceps +0.08
calves +0.05

while maintaining skeletal proportions.

7. SHAPE COEFFICIENT SOLVER

Build a solver converting semantic human properties into deformation coefficients.

Example:

interface ShapeSolveInput {
definition: HumanDefinition;
changedPropertyIds: number[];
}

interface ShapeSolveResult {
coefficients: Float32Array;
affectedBasisIds: Uint32Array;
affectedRegions: Uint32Array;
}

It should use:

property dependencies
anatomical constraints
identity restrictions
current pose where required
age/body composition interactions 8. CORRECTIVE SHAPE SOLVER

Individual shapes can be valid while combinations are invalid.

Example:

wide jaw +
strong smile

may distort the mouth/cheek transition.

Create corrective rules.

Conceptually:

if jawWidth > threshold
AND smile > threshold

activate:
wideJawSmileCorrective

Do not hard-code thousands of if statements permanently.

Create a generalized corrective activation system.

Example:

interface CorrectiveRule {
inputs: number[];
activation: CorrectiveActivation;
basisId: number;
}

Eventually this can support learned corrective prediction.

9. SPARSE SHAPE BASIS STORAGE

Reuse the existing sparse morph architecture.

Do NOT store a complete copy of the entire mesh for every basis vector.

Example basis:

nose.width

might affect only 4,000 vertices.

Store:

basis ID
affected vertex ranges
quantization scale
compressed deltas

Potential entry:

vertex ID
dx
dy
dz

Experiment with:

Float32 baseline
Float16
Int16 quantization
Int8 quantization
range encoding
delta prediction

Benchmark quality and memory.

10. PRODUCTION SKELETON

Upgrade the existing skeleton.

Do not discard existing GPU skinning.

Expand the skeleton toward a production humanoid rig.

Include:

root
pelvis

spine_01
spine_02
spine_03
chest

neck_01
neck_02
head

jaw
eye_l
eye_r

clavicle_l
scapula_l
upperarm_l
upperarm_twist_l
forearm_l
forearm_twist_l
hand_l

clavicle_r
...

Add complete finger chains.

Add:

thumb
index
middle
ring
pinky

Add lower-body chains:

thigh
thigh_twist
knee
shin
ankle
foot
toe 11. PARAMETRIC SKELETON ADAPTATION

The skeleton must adapt when anatomy changes.

Example:

height:
1.70 → 1.90

should update:

pelvis position
spine length
shoulder position
limb lengths
joint positions

Example:

shoulder.width += 10%

should move:

clavicle endpoints
shoulder joints
upper-arm origins

Do not leave bones floating inside modified geometry.

12. SKIN WEIGHT SYSTEM

Support at least four bone influences per vertex.

Architect for more if WebGPU implementation benefits.

Normalize weights.

Validate:

Σ weights = 1

Build tooling to identify:

unweighted vertices
invalid bone references
poorly normalized weights
extreme weighting 13. DUAL-QUATERNION SKINNING EXPERIMENT

The existing skinning system should remain the baseline.

Add optional dual-quaternion skinning.

Compare against linear blend skinning for:

shoulders
forearms
wrists
hips

Keep whichever produces measurable quality improvement without unacceptable cost.

14. POSE-SPACE DEFORMATION

Bones alone will not produce realistic shoulders, elbows, hips and knees.

Implement Pose Space Deformation.

Example:

shoulder.abduction = 90 degrees

activates:

shoulder_raise_90_corrective
deltoid_corrective
armpit_corrective
scapula_corrective

Blend continuously.

15. SHOULDER SYSTEM

Treat shoulders as a dedicated deformation problem.

Coordinate:

clavicle
scapula
humerus
deltoid
pectoralis
latissimus
upper-back tissue
armpit
skin

Test:

arm forward
arm sideways
arm overhead
arm backward

The shoulder silhouette must remain plausible.

16. MUSCLE SYSTEM

Create:

src/anatomy/muscles/

Represent major visible muscle groups.

Examples:

deltoid
biceps
triceps
pectoralis
trapezius
latissimus
rectus abdominis
gluteus
quadriceps
hamstrings
gastrocnemius

Each muscle needs approximately:

origin
insertion
rest volume
activation
bulge behavior

Start with simplified volumes.

Do NOT attempt medical-grade biomechanics.

Goal:

visually convincing real-time deformation.

17. MUSCLE DEFORMATION EXAMPLE

When:

elbow flexion = 120 degrees

calculate:

biceps shortening
biceps bulging
triceps relaxation
forearm interaction
skin response

Output deformation coefficients.

Do not directly simulate millions of tissue particles.

18. SOFT-TISSUE SYSTEM

Create simplified tissue layers:

muscle
fat
skin

Inputs:

bodyFat
muscularity
pose
motion velocity
gravity

Output:

surface deformation
secondary motion

Initially use corrective deformation and spring-like secondary motion.

Architect for more advanced simulation later.

19. HUMAN-SPECIFIC SDF COLLISION

Upgrade the prototype.

Build regional collision fields.

Example:

head
torso
pelvis

upperarm_l
forearm_l
hand_l

upperarm_r
...

thigh_l
shin_l
foot_l

Use simplified capsules/spheres first.

Potential future upgrade:

low-resolution volumetric SDF.

Expose:

distanceToHuman(point)
surfaceNormal(point)
projectOutside(point)

Use for:

hair
cloth
jewelry
attachments 20. HD SKIN RENDERER

Create a specialized skin rendering pipeline.

Required inputs:

base pigmentation
roughness
specular
normal
micro normal
displacement
thickness
subsurface scattering
AO
blood coloration
oiliness
wetness

Do not use one uniform skin roughness.

Define anatomical roughness regions.

Example:

forehead
nose
cheeks
lips
neck
hands
arms
legs 21. SKIN FREQUENCY SEPARATION

Separate detail into:

Macro

Geometry:

skull
nose
cheeks
jaw
body anatomy
Meso

Displacement:

wrinkles
folds
scars
Micro

Normal/procedural:

pores
fine wrinkles
skin grain

Do not use geometry for every pore.

22. PROCEDURAL PORES

Generate deterministic pore detail.

Inputs:

region
age
skin type
oiliness
seed

Example:

samplePoreField({
region: FACE_NOSE,
age: 42,
oiliness: 0.65,
seed: character.seed
});

Same character + same seed must reproduce the same pore pattern.

23. WRINKLE SYSTEM

Separate:

static age wrinkles
expression wrinkles

Static:

forehead
eyes
mouth
neck

Dynamic:

smile
squint
frown
brow raise

Example:

smile = 0.8

activates:

nasolabial fold
cheek compression
crow's feet
lip deformation

Dynamic wrinkles disappear/reduce when expression relaxes.

24. SUBSURFACE SCATTERING

Implement a practical real-time SSS approximation.

Use skin thickness and anatomical region.

Areas such as:

ears
nose
fingers

should transmit/scatter differently from thick facial/torso regions.

Create quality levels.

Example:

SSS OFF
SSS LOW
SSS HIGH

Semantic/perceptual LOD controls it.

25. EYE SYSTEM

Create:

src/render/eyes/

Separate:

sclera
iris
pupil
cornea
limbus
tear film
tear line

The cornea must be separate from the iris.

Implement corneal curvature/refraction approximation.

26. EYE SHADING

Add:

iris depth
limbal ring
sclera coloration
subtle sclera veins
corneal reflection
tear-film specular
pupil dilation

Avoid flat image-texture eyes.

27. GAZE SYSTEM

Implement:

human.lookAt(target);

Resolve target into coordinated:

left eye rotation
right eye rotation
head rotation
neck rotation

Use limits.

Eyes should move first for small gaze changes.

Head should increasingly participate for larger changes.

28. SACCADES

Humans do not hold perfectly static eyes.

Add tiny procedural saccades.

Use deterministic/random-seeded behavior.

Do not make them excessive.

29. BLINKING

Blinking must coordinate:

upper eyelid
lower eyelid
eyeball contact
expression

Do not simply scale the eye geometry.

Use proper eyelid deformation.

30. FACIAL ACTION SYSTEM

Expand the facial rig.

Use ARKit-compatible naming as an interoperability baseline.

Support controls including:

eyeBlinkLeft
eyeBlinkRight
eyeSquintLeft
eyeSquintRight

browInnerUp
browOuterUpLeft
browOuterUpRight

jawOpen

mouthSmileLeft
mouthSmileRight

mouthFrownLeft
mouthFrownRight

mouthPucker
mouthFunnel
mouthStretch
mouthPress
mouthRoll

cheekSquint
noseSneer

Add Daytona-specific higher-resolution controls as needed.

31. SEMANTIC EXPRESSIONS

Create high-level expressions.

Example:

human.setExpression("happy", 0.7);

Resolve into low-level facial actions.

Example:

mouth smile = .65
cheek raise = .42
eye squint = .20
brow adjustment = .08

Do not hardwire expression directly to vertices.

32. MICRO EXPRESSIONS

Add subtle:

blink variation
brow tension
lip tension
jaw tension
nostril motion
cheek motion

Use these during speech and idle behavior.

33. SPEECH CO-ARTICULATION

Upgrade speech beyond simple viseme switching.

Input:

phoneme A
phoneme B
phoneme C

The mouth shape for B should be influenced by A and C.

Create overlapping viseme curves.

Example:

previous phoneme
current phoneme
next phoneme

produce blended:

jaw
lips
tongue
cheeks 34. SPEECH PERFORMANCE

Speech should combine:

visemes
emotion
gaze
blinks
head motion
breathing
gestures

Example prompt:

"Say hello warmly."

should produce:

speech +
small smile +
soft eye expression +
appropriate gaze +
subtle head movement 35. MOTION COMPILER

Graduate the existing prototype.

Input:

"Walk to the desk, turn around and wave."

Output:

locomotion event
target position
turn event
arm gesture
IK
timing

Represent as deterministic timeline instructions.

Do not let AI directly write bone transforms frame-by-frame.

36. FULL-BODY IK

Implement targets such as:

hand target
foot target
head target
look target
pelvis target

Example:

human.reachFor(cupPosition);

should solve:

shoulder
elbow
wrist
torso

within joint limits.

37. FOOT PLACEMENT

Use ground/environment information.

During walking/standing:

raycast ground
↓
foot target
↓
ankle orientation
↓
leg IK
↓
pelvis adjustment

Prevent floating feet.

38. HAIR SYSTEM

Graduate the prototype in stages.

Level 1

Hair cards.

Level 2

Guide curves.

Level 3

GPU-generated interpolated strands.

Representation:

scalp follicles
↓
guide hairs
↓
strand interpolation
↓
clumps
↓
physics 39. HAIR PARAMETERS

Support:

hairline
length
density
thickness
curl
wave
frizz
clumping
part
direction
color
highlight
gray percentage
wetness

Example:

"Make her hair shoulder-length and curly."

must modify semantic hair state.

Do not replace the whole character.

40. HAIR LOD

Close:

strands

Medium:

clusters

Far:

cards/shell

Semantic LOD chooses representation.

41. CLOTHING SYSTEM

Upgrade clothing from prototype.

Garments remain independent character attachments.

Representation:

garment definition
mesh
material
fit
skin weights
collision
cloth parameters 42. CLOTHING FIT

Body modification must update clothing fit.

Example:

body muscularity +20%

should trigger:

body measurement change
↓
garment fit update
↓
collision update

Do not leave the body penetrating the shirt.

43. CLOTH PHYSICS

Upgrade existing cloth prototype.

Start with position-based dynamics.

Constraints:

distance
bend
attachment
collision

Run quality based on perceptual LOD.

44. TATTOOS

Upgrade tattoo projection.

Store tattoos using surface attachment coordinates.

Example:

{
"region": "arm.left.forearm",
"triangle": 3814,
"barycentric": [0.2, 0.5, 0.3],
"rotation": 12,
"scale": 0.3
}

Tattoo must follow:

morph
pose
skin deformation 45. PIERCINGS

Use semantic landmarks.

Example:

human://ear/left/helix

Store local orientation and offset.

When ear shape changes:

landmark updates
↓
piercing transform updates 46. INTERNAL ANATOMY

Graduate internal anatomy carefully.

Use modular assets for:

skeleton
major muscles
heart
lungs
liver
kidneys
digestive structures

Do not load them during normal rendering.

Use lazy loading.

Modes:

EXTERNAL
SKIN_TRANSPARENT
MUSCLE
SKELETON
ORGANS 47. TIME EVOLUTION

Graduate time transitions.

Example:

"Age this person 20 years."

Do NOT implement:

age += 20

and call it finished.

Age influences:

facial volume
skin elasticity
wrinkles
pigmentation
hair density
hair gray
posture
soft tissue

Use correlated age curves.

48. HAIR GROWTH

Example:

advanceTime(180 days)

can update:

scalp hair length
facial hair length

subject to configured growth models.

The event remains deterministic.

49. FITNESS / BODY EVOLUTION

Represent progressive change.

Example:

strength training for six months

can influence:

muscle coefficients
body composition
posture

Use bounded curves.

Do not transform the character instantly unless requested.

50. IDENTITY PRESERVATION UPGRADE

After introducing HD shape space, upgrade identity preservation.

Create an Identity Vector.

Example:

skull
eyes
nose
jaw
mouth
cheeks
distinctive asymmetry

For:

"make him older"

identity weights remain strongly preserved.

For:

"make a different person"

identity constraints may be relaxed.

51. IDENTITY DRIFT TEST

Render standardized facial views before and after unrelated operations.

Examples:

change shirt
change hair
smile
walk
age slightly

Structural identity should remain stable except where explicitly expected.

52. PERCEPTUAL VALIDATION

Graduate the current prototype.

Create standardized validation cameras:

face_front
face_left
face_right
face_three_quarter

body_front
body_side
body_back

hand_close
eye_close

Check geometric conditions directly where possible.

53. INTERSECTION VALIDATION

Automatically detect:

teeth through lips
tongue through face
eyes through eyelids
hair through skull
clothing through body
limb self-intersection

Use:

SDF
BVH
triangle tests

depending on precision needed.

54. HUMAN PROPORTION VALIDATION

Validate anatomical relationships.

Examples:

eye spacing
jaw/skull relationship
limb proportions
joint positions
hand proportions
foot proportions

Use realistic ranges for REALISTIC mode.

55. GPU TIMESTAMP BENCHMARKING

Graduate the timestamp benchmark.

Measure actual GPU passes where supported.

Record:

morph
corrective
skinning
normals
hair
cloth
render

Never fabricate unavailable timing.

If timestamp queries are unavailable, report:

GPU timing unavailable 56. LOCALIZED EDIT BENCHMARK

Create a permanent benchmark.

Example operation:

nose width +5%

Report:

total vertices
affected vertices
percentage touched

dependencies visited
compute nodes scheduled

CPU delta compile time
GPU morph time
GPU normal time

systems reused
systems recomputed 57. PERFORMANCE DEMO PANEL

Display something like:

FPS 60

GPU Frame 9.4 ms
Human GPU 5.1 ms

Vertices 186,422
Touched this edit 4,032
Touched % 2.16%

Morph 0.08 ms
Skinning 0.12 ms
Hair 1.4 ms
Skin render 1.8 ms

Face LOD 5
Eye LOD 5
Hair LOD 4
Body LOD 3

This proves the architecture.

58. GPU SCHEDULER UPGRADE

Use measured timings.

Each workload provides:

priority
estimated cost
actual moving-average cost
visibility
semantic importance
deadline

Scheduler chooses:

RUN
REDUCE
REUSE
DEFER
SKIP

Example:

If frame budget is exceeded:

KEEP:
face animation
eyes
visible skin

REDUCE:
hair physics
cloth iterations
micro skin
shadow quality 59. TEMPORAL REUSE

Add validity tracking.

Potentially reuse:

skin shading
hair simulation
cloth
shadow
microdetail

when inputs have not changed.

Never reuse invalid history.

Track dependency/version IDs.

60. PROCEDURAL SKIN RESIDUAL

Keep procedural skin deterministic.

Generate detail using:

character seed
anatomical region
age
skin properties

Use spatially stable coordinates.

Do not let pores swim across the skin during animation.

61. NEURAL SKIN RESIDUAL

Keep neural residual optional.

Pipeline:

PBR skin +
SSS +
procedural detail +
small neural residual

The neural component should predict missing appearance detail.

It should NOT generate the underlying face.

Provide a conventional fallback.

62. WEBNN EXPERIMENT

If neural residual inference is introduced:

compare:

WebGPU compute
WebNN
WASM

Measure actual performance.

Do not make WebNN mandatory.

63. HD TEXTURE STREAMING

Support high-resolution textures without loading everything at full resolution.

Use:

KTX2
Basis
mipmaps

Architect region-aware streaming.

Example:

Face close-up:

face high-resolution
feet lower-resolution 64. HUMAN SEMANTIC TEXTURE LOD

Texture quality should follow human importance.

Example:

camera = face close-up

prioritize:

eyes
face
lips
hairline

not:

shoes
back
legs 65. GLTF / GLB IMPORT

Use the canonical topology adapter.

Validate imported humans.

Check:

vertex count
topology signature
regions
UVs
skeleton
weights
landmarks
required parts

Reject incompatible topology explicitly.

Never silently reinterpret a random mesh as Daytona canonical topology.

66. GLTF EXPORT

Export current compiled character when requested.

Include:

mesh
materials
skeleton
skin weights
animations

Where Daytona-specific semantics cannot fit standard glTF, store extension metadata where appropriate.

HumanDefinition remains the authoritative editable format.

67. DAYTONA HUMAN PACKAGE

Create a future package concept:

.dhuman

Possible contents:

manifest
HDL
topology reference
identity coefficients
shape coefficients
skin configuration
hair configuration
attachments
clothing
timeline
version metadata

Do not finalize binary format prematurely.

Start with a versioned package manifest.

68. PHOTO-TO-HUMAN PREPARATION

Do not implement arbitrary AI mesh generation.

Future photo fitting pipeline:

photo
↓
facial landmarks
↓
proportion estimation
↓
shape coefficients
↓
identity solver
↓
Daytona canonical human

The photo estimates parameters.

It does not become the character representation.

69. PROMPT-TO-HUMAN UPGRADE

Prompt interpreter should understand more semantic properties.

Example:

"Create a tall athletic man with a narrow face,
strong jaw, deep-set brown eyes and short curly hair."

AI produces:

identity parameters
body parameters
face parameters
skin parameters
hair parameters

Then engine validation occurs.

AI does not produce vertices.

70. COMPLEX PROMPT DECOMPOSITION

Example:

"Make her older, cut her hair short, put her
in a blue jacket and have her smile."

Compile into separate events:

AGE
HAIR
CLOTHING
EXPRESSION

Each produces its own dependency delta.

Do not regenerate the human.

71. LIVE MODIFICATION DURING ANIMATION

This is a critical demonstration.

Character should be able to:

walk +
speak +
smile

while receiving:

change hair
change clothing
modify face

Animation must continue.

No character reload.

72. FULL HUMAN STATE TEST

Create one integration test exercising:

create human
modify anatomy
modify face
add tattoo
add piercing
add clothing
change hair
set expression
walk
speak
advance time
undo
redo
save
reload

Reloaded state must reproduce the character deterministically.

73. HD HUMAN VISUAL TEST

Create a canonical benchmark character.

Render:

neutral front
neutral profile
neutral 3/4

smile
frown
blink
jaw open

arm overhead
elbow flexed
sitting
walking

Store approved images for regression testing.

74. EXTREME PARAMETER TEST

Generate combinations near REALISTIC limits.

Examples:

maximum realistic height
minimum realistic height

high muscularity
high body fat

wide jaw
narrow jaw

large nose
small nose

Check:

topology
intersections
skeleton
skin weights
clothing
attachments 75. RANDOM HUMAN FUZZ TEST

Generate thousands of seeded HumanDefinitions inside realistic limits.

For each:

solve anatomy
generate shape
pose
validate

Detect:

NaN
Infinity
invalid GPU values
mesh explosions
intersections
invalid joints
invalid weights

This is essential once parameter interactions become complicated.

76. MEMORY TESTING

Measure:

canonical shared geometry
shape basis
per-human parameters
working geometry
textures
hair
clothing
temporary buffers

Display per-character memory estimate.

77. MULTIPLE HUMANS

After one HD human works, test:

1
2
5
10
20

characters.

Share:

canonical topology
shape basis
shaders
textures where possible
animation clips

Keep per-character state separate.

78. GPU-DRIVEN VISIBILITY

Eventually move decisions such as:

visible hair clusters
visible clothing sections
LOD

onto GPU where beneficial.

Benchmark against CPU decisions.

Do not move logic to GPU merely because it sounds impressive.

79. FRAME-BUDGET TEST

Target:

60 FPS = 16.67ms

Define human budget.

Example:

animation 0.5ms
deformation 1.0ms
skin 2.0ms
eyes 0.5ms
hair 2.0ms
clothing 1.0ms
remaining scene 4.0ms
headroom ...

These are initial budgets, not assumptions.

Measure actual hardware.

80. QUALITY TIERS

Create:

CINEMATIC
HIGH
MEDIUM
LOW
COMPATIBILITY

Example:

CINEMATIC
highest shape detail
SSS high
strand hair
high skin detail
cloth high
eye optics high
LOW
reduced geometry
simple skin
hair cards
simple eyes
reduced physics 81. CAPABILITY BENCHMARK

At startup test representative work:

morph
skinning
normal reconstruction
texture sampling
hair
cloth

Choose default tier based on measured performance and WebGPU limits.

82. DEVICE LOSS

Test intentionally losing/recreating GPU state where possible.

Recovery:

HumanDefinition +
timeline +
asset references
↓
rebuild GPU state

No character loss.

83. DOCUMENTATION

For every subsystem document:

purpose
inputs
outputs
CPU/GPU ownership
dependencies
dirty behavior
LOD behavior
memory cost
performance cost
fallback
tests
status 84. CAPABILITY MATRIX

Continue using:

IMPLEMENTED
PROTOTYPE
PARTIAL
PLANNED

Do not promote a feature to IMPLEMENTED merely because its class exists.

IMPLEMENTED should mean:

functional
integrated
tested
documented 85. IMPLEMENTATION ORDER

Do NOT implement this prompt randomly.

Use this order:

1 Canonical provider abstraction

2 HD canonical topology ingestion

3 semantic regions

4 anatomical landmarks

5 Human Shape Space

6 Face Shape Basis

7 Body Shape Basis

8 Shape Coefficient Solver

9 Corrective Shape Solver

10 sparse HD basis integration

11 production skeleton

12 skeleton adaptation

13 skin weights

14 pose-space correctives

15 HD skin renderer

16 procedural skin

17 eyes

18 facial system

19 muscle approximation

20 soft tissue

21 SDF collision

22 hair

23 clothing

24 cloth

25 tattoos/piercings

26 motion + IK

27 speech performance

28 aging/time

29 identity validation

30 perceptual validation

31 GPU benchmarking

32 GPU scheduler optimization

33 texture streaming

34 package/export

35 multi-human optimization 86. FIRST DEVELOPMENT MILESTONE

Do NOT attempt the entire list before producing something testable.

Milestone:

DAYTONA HD FACE V0.1

Requirements:

real canonical head topology

eyes
teeth
tongue

semantic face regions

facial landmarks

at least 30 identity shape controls

at least 20 expression controls

GPU sparse deformation

identity preservation

skin PBR

basic SSS

eye shader

Demo controls:

nose width
nose length

jaw width
chin projection

eye spacing
eye size

cheek width

mouth width
lip thickness

age

All modifications must go through HumanDefinition events.

87. SECOND MILESTONE
    DAYTONA HD BODY V0.1

Requirements:

real body topology
production skeleton
skin weights
body shape basis
height
shoulder width
body composition
muscularity
arm/leg proportions
pose-space shoulder/elbow/hip/knee correctives 88. THIRD MILESTONE
DAYTONA HD PERFORMANCE V0.1

Character:

walks
looks
blinks
smiles
speaks
gestures

while remaining continuously editable.

89. FOURTH MILESTONE
    DAYTONA HD APPEARANCE V0.1

Implement:

procedural skin
wrinkles
hair
tattoos
piercings
clothing
cloth 90. FIFTH MILESTONE
DAYTONA HD EVOLUTION V0.1

Demonstrate:

Day 0
↓
six months
↓
five years
↓
twenty years

with deterministic:

hair
skin
body
age

changes while identity remains recognizable.

91. FINAL REQUIRED DEMONSTRATION

Create one persistent Daytona Human.

Then execute:

Create person

↓
"Make his jaw wider."

↓
"Give him short brown hair."

↓
"Add a tattoo to his left forearm."

↓
"Put him in a jacket."

↓
"Smile."

↓
"Walk toward the camera."

↓
"Say: Welcome to Daytona."

↓
while speaking:
"Make the jacket darker."

↓
"Age him ten years."

↓
Undo age

↓
Undo jacket

↓
Restore age

↓
Save

↓
Close character

↓
Reload

The final reloaded character must reproduce the saved state.

No regeneration.

No identity replacement.

No topology replacement.

No animation-rig replacement.

92. PERFORMANCE PROOF

During the demonstration display:

HumanDefinition changes

Dependency nodes touched

Dirty anatomical regions

Shape bases activated

Vertices affected

Compute kernels scheduled

GPU time

Systems reused

Systems recomputed

This is crucial.

The architecture's central advantage must be visible and measurable.

93. NON-NEGOTIABLE RULES

DO NOT:

regenerate the whole human for localized edits
allow AI to directly write mesh vertices
use the visible mesh as persistent character state
destroy the debug block human
replace the event architecture
create separate mutation APIs for every subsystem
allow expression changes to modify identity
allow clothing changes to modify anatomy
bake tattoos permanently into base textures
bind attachments to world coordinates
assume all regions are contiguous vertex ranges
reload the character when appearance changes
hide GPU failures
fabricate benchmark numbers
mark placeholders as implemented
add dependencies merely to avoid understanding the underlying problem 94. CENTRAL ENGINE INVARIANT

Maintain:

HumanDefinition +
Identity +
Anatomical Constraints +
Relationships +
Timeline
=

CHARACTER

The mesh is a compiled output.

95. CENTRAL PERFORMANCE INVARIANT

Maintain:

Character Event
↓
Changed semantic state
↓
Affected dependencies
↓
Minimal shape/deformation work
↓
Minimal GPU work
↓
Updated visual human

Do not rebuild what did not change.

96. CENTRAL HD HUMAN INVARIANT

The production system should become:

                 HUMAN DEFINITION
                        │
                        ▼
              ANATOMICAL CONSTRAINTS
                        │
                        ▼
                IDENTITY SOLVER
                        │
                        ▼
                HUMAN SHAPE SPACE
                        │
                        ▼
              COEFFICIENT SOLVER
                        │
                        ▼
              CORRECTIVE SOLVER
                        │
                        ▼
              SPARSE DELTA COMPILER
                        │
                        ▼
                   WEBGPU
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
     SKELETON         TISSUE          SURFACE
        │               │               │
        ▼               ▼               ▼
     SKINNING        MUSCLES           SKIN
     CORRECTIVES     SOFT BODY         EYES
                                       HAIR
                                       CLOTH
                        │
                        ▼
                 HD HUMAN RENDERER

97. BEGINNING INSTRUCTIONS FOR THE CODING AI

Before modifying code:

Pull the current main branch.
Inspect the complete repository.
Read README and capability matrix.
Locate all existing implementations corresponding to this prompt.
DO NOT duplicate existing systems.
Identify which systems are IMPLEMENTED versus PROTOTYPE.
Identify interfaces that can be extended.
Run all existing tests.
Run build.
Record baseline performance where possible.

Then produce an implementation report containing:

EXISTING AND REUSABLE

EXISTING BUT NEEDS EXTENSION

PROTOTYPE TO GRADUATE

MISSING

ARCHITECTURAL CONFLICTS

ASSET REQUIREMENTS

FIRST MILESTONE

Then begin with:

DAYTONA HD FACE V0.1

Do not begin with hair, organs, clothing or neural rendering.

The first target is a convincing, deformable, identity-preserving human head using the architecture already built.

98. SUCCESS CONDITION

The immediate project succeeds when DaytonaWebGPUAvatar can load a real HD canonical human and the existing architecture can modify that human through semantic parameters while preserving:

topology
identity
skeleton
animation
attachments
materials
history

and updating only the affected computation.

Once this works, continue progressively through body anatomy, tissue, skin, eyes, hair, clothing, speech, motion and temporal evolution.

Do not chase additional feature breadth until the HD human itself proves that the architecture works on production-quality geometry.

The key change from your earlier giant prompt is that this one tells the AI how each missing piece connects to the code you've already built. It also puts HD Face V0.1 first, because right now a realistic deformable head will teach you more about whether the engine actually works than another dozen prototype subsystems will.
