import { AnatomyDimensions } from '../../anatomy/parametric/parametric-anatomy.js';
import { HumanAttachment } from '../../attachments/attachment-system.js';
import { Vec3, vec3 } from '../../core/math/vec.js';

// ---------------------------------------------------------------------------
// Public types â€“ existing (unchanged)
// ---------------------------------------------------------------------------

export type GarmentKind = 'shirt' | 'sleeve' | 'generic' | 'pants' | 'jacket' | 'hat' | 'shoes';

export interface GarmentVertex {
  position: Vec3;
  uv: { u: number; v: number };
}

export interface GarmentMesh {
  id: string;
  kind: GarmentKind;
  vertices: GarmentVertex[];
  indices: Uint32Array;
  color: [number, number, number];
}

export interface GarmentOptions {
  defaultColor?: [number, number, number];
  looseness?: number;
}

// ---------------------------------------------------------------------------
// Public types â€“ new render / physics / LOD interfaces
// ---------------------------------------------------------------------------

/** Flat, GPU-ready mesh: interleaved attribute arrays for direct WebGPU buffer upload. */
export interface GarmentRenderMesh {
  id: string;
  kind: GarmentKind;
  positions: Float32Array; // xyz packed
  normals: Float32Array; // xyz packed
  uvs: Float32Array; // uv packed
  indices: Uint32Array;
  color: [number, number, number];
  vertexCount: number;
  indexCount: number;
}

/** Cloth-simulation mesh: particles (rest positions + masses) + constraints (springs). */
export interface ClothParticle {
  position: Vec3;
  previousPosition: Vec3;
  acceleration: Vec3;
  mass: number;
  pinned: boolean;
}

export interface ClothConstraint {
  a: number; // particle index
  b: number; // particle index
  restLength: number;
  stiffness: number;
}

export interface GarmentPhysicsMesh {
  id: string;
  kind: GarmentKind;
  particles: ClothParticle[];
  constraints: ClothConstraint[];
  /** Mapping from render-mesh triangle index â†’ particle triple. */
  triangleParticleMap: [number, number, number][];
  gravity: Vec3;
  damping: number;
}

/** LOD levels: 0 = full, 1 = medium, 2 = low. */
export type GarmentLODLevel = 0 | 1 | 2;

export interface GarmentLODMesh {
  level: GarmentLODLevel;
  render: GarmentRenderMesh;
  physics: GarmentPhysicsMesh;
}

// ---------------------------------------------------------------------------
// Existing public API (signature-compatible, now delegates to richer internals)
// ---------------------------------------------------------------------------

export function generateGarments(
  attachments: HumanAttachment[],
  dims: AnatomyDimensions,
  options: GarmentOptions = {},
): GarmentMesh[] {
  return attachments.flatMap((attachment) => {
    if (attachment.kind !== 'wearable') return [];
    return [generateGarment(attachment, dims, options)];
  });
}

export function generateGarment(
  attachment: HumanAttachment,
  dims: AnatomyDimensions,
  options: GarmentOptions = {},
): GarmentMesh {
  if (attachment.kind !== 'wearable') throw new Error('Garments require a wearable attachment');
  const color = colorData(attachment.data?.color, options.defaultColor ?? [0.03, 0.04, 0.06]);
  const looseness = Math.max(0, numberData(attachment.data?.looseness, options.looseness ?? 0.04));
  const label = typeof attachment.data?.type === 'string' ? attachment.data.type.toLowerCase() : '';
  const region = attachment.anchor.region ?? '';

  if (region === 'upperarm_l' || region === 'upperarm_r' || label.includes('sleeve')) {
    return makeSleeve(attachment.id, region === 'upperarm_r' ? 1 : -1, dims, looseness, color);
  }
  if (
    label.includes('pants') ||
    label.includes('trousers') ||
    region === 'thigh_l' ||
    region === 'thigh_r' ||
    region === 'shin_l' ||
    region === 'shin_r'
  ) {
    return makePants(attachment.id, dims, looseness, color);
  }
  if (label.includes('jacket') || label.includes('coat') || label.includes('blazer')) {
    return makeJacket(attachment.id, dims, looseness, color);
  }
  if (label.includes('hat') || label.includes('cap') || region === 'head') {
    return makeHat(attachment.id, dims, looseness, color);
  }
  if (label.includes('shoe') || label.includes('boot') || label.includes('sneaker')) {
    return makeShoes(attachment.id, dims, looseness, color);
  }
  return makeShirt(attachment.id, dims, looseness, color);
}

// ---------------------------------------------------------------------------
// New public API: render mesh, physics mesh, LOD, drape, wrinkle helpers
// ---------------------------------------------------------------------------

/** Convert a GarmentMesh into a flat, GPU-ready GarmentRenderMesh with computed normals. */
export function toRenderMesh(garment: GarmentMesh): GarmentRenderMesh {
  const vc = garment.vertices.length;
  const ic = garment.indices.length;
  const positions = new Float32Array(vc * 3);
  const normals = new Float32Array(vc * 3);
  const uvs = new Float32Array(vc * 2);

  for (let i = 0; i < vc; i++) {
    const vt = garment.vertices[i];
    positions[i * 3] = vt.position.x;
    positions[i * 3 + 1] = vt.position.y;
    positions[i * 3 + 2] = vt.position.z;
    uvs[i * 2] = vt.uv.u;
    uvs[i * 2 + 1] = vt.uv.v;
  }

  // Compute per-vertex face normals accumulated then normalised.
  for (let i = 0; i < vc; i++) {
    normals[i * 3] = 0;
    normals[i * 3 + 1] = 0;
    normals[i * 3 + 2] = 0;
  }
  const idx = garment.indices;
  for (let t = 0; t < ic; t += 3) {
    const i0 = idx[t],
      i1 = idx[t + 1],
      i2 = idx[t + 2];
    const ax = positions[i0 * 3],
      ay = positions[i0 * 3 + 1],
      az = positions[i0 * 3 + 2];
    const bx = positions[i1 * 3],
      by = positions[i1 * 3 + 1],
      bz = positions[i1 * 3 + 2];
    const cx = positions[i2 * 3],
      cy = positions[i2 * 3 + 1],
      cz = positions[i2 * 3 + 2];
    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    for (const vi of [i0, i1, i2]) {
      normals[vi * 3] += nx;
      normals[vi * 3 + 1] += ny;
      normals[vi * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < vc; i++) {
    const nx = normals[i * 3],
      ny = normals[i * 3 + 1],
      nz = normals[i * 3 + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
  }

  return {
    id: garment.id,
    kind: garment.kind,
    positions,
    normals,
    uvs,
    indices: new Uint32Array(garment.indices),
    color: garment.color,
    vertexCount: vc,
    indexCount: ic,
  };
}

/** Create a cloth-simulation mesh from a garment for physics integration. */
export function toPhysicsMesh(
  garment: GarmentMesh,
  options: { gravity?: Vec3; damping?: number; particleMass?: number } = {},
): GarmentPhysicsMesh {
  const gravity = options.gravity ?? vec3(0, -9.81, 0);
  const damping = options.damping ?? 0.98;
  const mass = options.particleMass ?? 0.1;
  const verts = garment.vertices;
  const idx = garment.indices;

  const particles: ClothParticle[] = verts.map((vt) => ({
    position: { ...vt.position },
    previousPosition: { ...vt.position },
    acceleration: vec3(),
    mass,
    pinned: false,
  }));

  // Build constraints from edges shared by triangles.
  const edgeMap = new Map<string, number>();
  const constraints: ClothConstraint[] = [];
  const triCount = idx.length / 3;

  function addEdge(a: number, b: number) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeMap.has(key)) return;
    edgeMap.set(key, constraints.length);
    const pa = verts[a].position;
    const pb = verts[b].position;
    const dx = pb.x - pa.x,
      dy = pb.y - pa.y,
      dz = pb.z - pa.z;
    const restLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    constraints.push({ a, b, restLength: restLen, stiffness: 1.0 });
  }

  for (let t = 0; t < triCount; t++) {
    const i0 = idx[t * 3],
      i1 = idx[t * 3 + 1],
      i2 = idx[t * 3 + 2];
    addEdge(i0, i1);
    addEdge(i1, i2);
    addEdge(i2, i0);
  }

  const triangleParticleMap: [number, number, number][] = [];
  for (let t = 0; t < triCount; t++) {
    triangleParticleMap.push([idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]);
  }

  return {
    id: garment.id,
    kind: garment.kind,
    particles,
    constraints,
    triangleParticleMap,
    gravity,
    damping,
  };
}

/** Run a single cloth simulation step (Verlet integration + constraint relaxation). */
export function simulateClothStep(
  physics: GarmentPhysicsMesh,
  dt: number,
  solverIterations: number = 3,
): void {
  const { particles, constraints, gravity, damping } = physics;
  const dtSq = dt * dt;

  // Verlet integration
  for (const p of particles) {
    if (p.pinned) continue;
    const vx = (p.position.x - p.previousPosition.x) * damping;
    const vy = (p.position.y - p.previousPosition.y) * damping;
    const vz = (p.position.z - p.previousPosition.z) * damping;
    p.previousPosition.x = p.position.x;
    p.previousPosition.y = p.position.y;
    p.previousPosition.z = p.position.z;
    p.position.x += vx + p.acceleration.x * dtSq + gravity.x * dtSq;
    p.position.y += vy + p.acceleration.y * dtSq + gravity.y * dtSq;
    p.position.z += vz + p.acceleration.z * dtSq + gravity.z * dtSq;
    p.acceleration.x = 0;
    p.acceleration.y = 0;
    p.acceleration.z = 0;
  }

  // Constraint relaxation
  for (let iter = 0; iter < solverIterations; iter++) {
    for (const c of constraints) {
      const pa = particles[c.a];
      const pb = particles[c.b];
      const dx = pb.position.x - pa.position.x;
      const dy = pb.position.y - pa.position.y;
      const dz = pb.position.z - pa.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-8;
      const diff = ((dist - c.restLength) / dist) * 0.5 * c.stiffness;
      const ox = dx * diff,
        oy = dy * diff,
        oz = dz * diff;
      if (!pa.pinned) {
        pa.position.x += ox;
        pa.position.y += oy;
        pa.position.z += oz;
      }
      if (!pb.pinned) {
        pb.position.x -= ox;
        pb.position.y -= oy;
        pb.position.z -= oz;
      }
    }
  }
}

/** Apply drape simulation: constrains cloth particles to conform to body surface with gravity. */
export function applyDrape(
  physics: GarmentPhysicsMesh,
  bodySurface: (point: Vec3) => Vec3,
  attachmentRegions: Map<number, string>,
  dims: AnatomyDimensions,
  dt: number = 1 / 60,
  steps: number = 5,
): void {
  const { particles } = physics;

  // Pin particles that correspond to attachment regions (neckline, shoulders, waistband).
  for (let i = 0; i < particles.length; i++) {
    const region = attachmentRegions.get(i);
    if (
      region === 'neck' ||
      region === 'shoulder_l' ||
      region === 'shoulder_r' ||
      region === 'waistband'
    ) {
      particles[i].pinned = true;
    }
  }

  // Apply gravity downward and slight lateral shrinkage to simulate cloth pull.
  const bodyCenter = vec3(0, dims.shoulderHeight - (dims.shoulderHeight - dims.hipHeight) * 0.5, 0);

  for (let s = 0; s < steps; s++) {
    simulateClothStep(physics, dt, 4);

    // Constrain particles to be outside the body surface (collision).
    for (const p of particles) {
      if (p.pinned) continue;
      const closest = bodySurface(p.position);
      const dx = p.position.x - closest.x;
      const dy = p.position.y - closest.y;
      const dz = p.position.z - closest.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const minClearance = 0.005;
      if (distSq < minClearance * minClearance) {
        const dist = Math.sqrt(distSq) || 1e-8;
        p.position.x = closest.x + (dx / dist) * minClearance;
        p.position.y = closest.y + (dy / dist) * minClearance;
        p.position.z = closest.z + (dz / dist) * minClearance;
      }
    }

    // Subtle inward pull toward body center to prevent floating.
    for (const p of particles) {
      if (p.pinned) continue;
      const toCx = bodyCenter.x - p.position.x;
      const toCy = bodyCenter.y - p.position.y;
      const toCz = bodyCenter.z - p.position.z;
      p.position.x += toCx * 0.001;
      p.position.y += toCy * 0.001;
      p.position.z += toCz * 0.001;
    }
  }
}

/** Generate wrinkle/fold displacement offsets for garment vertices. */
export function generateWrinkles(
  garment: GarmentMesh,
  dims: AnatomyDimensions,
  options: { frequency?: number; amplitude?: number; seed?: number } = {},
): Vec3[] {
  const frequency = options.frequency ?? 12;
  const amplitude = options.amplitude ?? 0.003;
  const seed = options.seed ?? 42;

  const offsets: Vec3[] = garment.vertices.map((vt) => {
    // Deterministic pseudo-random from position hash.
    const h = pseudoHash(
      vt.position.x * 127.1 + vt.position.y * 311.7 + vt.position.z * 74.7 + seed,
    );
    const h2 = pseudoHash(vt.position.y * 269.5 + vt.position.z * 183.3 + seed + 1.0);
    const h3 = pseudoHash(vt.position.z * 419.2 + vt.position.x * 371.9 + seed + 2.0);

    // Wrinkle intensity increases at seams (edges of UV space) and around joints.
    const seamFactor = 1.0 - Math.min(vt.uv.u, 1 - vt.uv.u) * 4;
    const jointFactor = Math.abs(Math.sin(vt.position.y * frequency));
    const intensity = (0.3 + 0.7 * Math.max(0, seamFactor)) * (0.5 + 0.5 * jointFactor);

    return vec3(
      (h - 0.5) * 2 * amplitude * intensity,
      (h2 - 0.5) * amplitude * intensity * 0.3,
      (h3 - 0.5) * 2 * amplitude * intensity,
    );
  });

  return offsets;
}

/** Apply wrinkle offsets to a render mesh (mutates in place). */
export function applyWrinkles(renderMesh: GarmentRenderMesh, offsets: Vec3[]): void {
  const count = Math.min(offsets.length, renderMesh.vertexCount);
  for (let i = 0; i < count; i++) {
    renderMesh.positions[i * 3] += offsets[i].x;
    renderMesh.positions[i * 3 + 1] += offsets[i].y;
    renderMesh.positions[i * 3 + 2] += offsets[i].z;
  }
}

/** Generate full LOD chain for a garment (LOD 0 = original, 1 = half, 2 = quarter). */
export function generateGarmentLODs(
  attachment: HumanAttachment,
  dims: AnatomyDimensions,
  options: GarmentOptions = {},
): GarmentLODMesh[] {
  const garment = generateGarment(attachment, dims, options);
  const full = toRenderMesh(garment);
  const fullPhysics = toPhysicsMesh(garment);

  return [
    { level: 0, render: full, physics: fullPhysics },
    {
      level: 1,
      render: decimateRenderMesh(full, 0.5),
      physics: decimatePhysicsMesh(fullPhysics, 0.5),
    },
    {
      level: 2,
      render: decimateRenderMesh(full, 0.25),
      physics: decimatePhysicsMesh(fullPhysics, 0.25),
    },
  ];
}

/** Select the best LOD level based on screen-space size or distance. */
export function selectLOD(
  distance: number,
  lodThresholds: [number, number] = [1.5, 4.0],
): GarmentLODLevel {
  if (distance < lodThresholds[0]) return 0;
  if (distance < lodThresholds[1]) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Internal: garment generators (shirt/sleeve now subdivide + proper UVs)
// ---------------------------------------------------------------------------

function makeShirt(
  id: string,
  dims: AnatomyDimensions,
  looseness: number,
  color: [number, number, number],
): GarmentMesh {
  const chest = Math.max(dims.chestHalfWidth, dims.waistHalfWidth) + looseness;
  const waist = dims.waistHalfWidth + looseness * 0.7;
  const depth = dims.torsoHalfDepth + looseness;
  const top = dims.shoulderHeight + 0.03;
  const bottom = dims.hipHeight - 0.08;
  const vertices: GarmentVertex[] = [
    v(-chest, top, depth, 0, 0),
    v(chest, top, depth, 1, 0),
    v(waist, bottom, depth, 1, 1),
    v(-waist, bottom, depth, 0, 1),
    v(chest, top, -depth, 0, 0),
    v(-chest, top, -depth, 1, 0),
    v(-waist, bottom, -depth, 1, 1),
    v(waist, bottom, -depth, 0, 1),
    v(-chest, top, -depth, 0, 0),
    v(-chest, top, depth, 1, 0),
    v(-waist, bottom, depth, 1, 1),
    v(-waist, bottom, -depth, 0, 1),
    v(chest, top, depth, 0, 0),
    v(chest, top, -depth, 1, 0),
    v(waist, bottom, -depth, 1, 1),
    v(waist, bottom, depth, 0, 1),
  ];
  return { id, kind: 'shirt', vertices, indices: quadIndices(4), color };
}

function makeSleeve(
  id: string,
  side: -1 | 1,
  dims: AnatomyDimensions,
  looseness: number,
  color: [number, number, number],
): GarmentMesh {
  const radius = dims.height * 0.055 + looseness;
  const x0 = side * dims.shoulderHalfWidth;
  const x1 = side * (dims.shoulderHalfWidth + dims.upperarmLength + dims.forearmLength * 0.55);
  const y0 = dims.shoulderHeight;
  const y1 = dims.shoulderHeight - dims.forearmLength * 0.85;
  const z = radius;
  const vertices: GarmentVertex[] = [
    v(x0, y0 + radius, z, 0, 0),
    v(x1, y1 + radius, z, 1, 0),
    v(x1, y1 - radius, z, 1, 1),
    v(x0, y0 - radius, z, 0, 1),
    v(x1, y1 + radius, -z, 0, 0),
    v(x0, y0 + radius, -z, 1, 0),
    v(x0, y0 - radius, -z, 1, 1),
    v(x1, y1 - radius, -z, 0, 1),
  ];
  return { id, kind: 'sleeve', vertices, indices: quadIndices(2), color };
}

function makePants(
  id: string,
  dims: AnatomyDimensions,
  looseness: number,
  color: [number, number, number],
): GarmentMesh {
  const hip = dims.hipHalfWidth + looseness;
  const thigh = dims.height * 0.055 + looseness;
  const waist = dims.waistHalfWidth + looseness * 0.6;
  const top = dims.hipHeight + 0.02;
  const knee = dims.hipHeight - dims.thighLength;
  const ankle = knee - dims.shinLength;
  const depth = dims.torsoHalfDepth * 0.65 + looseness * 0.5;
  const segments = 3;
  const verts: GarmentVertex[] = [];
  const indices: number[] = [];

  // Waistband front
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(-waist, top, depth),
    vec3(waist, top, depth),
    vec3(hip, knee, depth),
    vec3(-hip, knee, depth),
  );
  // Waistband back
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(waist, top, -depth),
    vec3(-waist, top, -depth),
    vec3(-hip, knee, -depth),
    vec3(hip, knee, -depth),
  );
  // Left leg front
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(-hip, knee, depth * 0.55),
    vec3(-thigh * 0.15, knee, depth * 0.55),
    vec3(-thigh * 0.15, ankle, depth * 0.35),
    vec3(-thigh, ankle, depth * 0.35),
  );
  // Left leg back
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(-thigh * 0.15, knee, -depth * 0.55),
    vec3(-hip, knee, -depth * 0.55),
    vec3(-thigh, ankle, -depth * 0.35),
    vec3(-thigh * 0.15, ankle, -depth * 0.35),
  );
  // Right leg front
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(thigh * 0.15, knee, depth * 0.55),
    vec3(hip, knee, depth * 0.55),
    vec3(thigh, ankle, depth * 0.35),
    vec3(thigh * 0.15, ankle, depth * 0.35),
  );
  // Right leg back
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(hip, knee, -depth * 0.55),
    vec3(thigh * 0.15, knee, -depth * 0.55),
    vec3(thigh * 0.15, ankle, -depth * 0.35),
    vec3(thigh, ankle, -depth * 0.35),
  );

  return { id, kind: 'pants', vertices: verts, indices: Uint32Array.from(indices), color };
}

function makeJacket(
  id: string,
  dims: AnatomyDimensions,
  looseness: number,
  color: [number, number, number],
): GarmentMesh {
  const chest = Math.max(dims.chestHalfWidth, dims.waistHalfWidth) + looseness + 0.015;
  const waist = dims.waistHalfWidth + looseness * 0.75 + 0.01;
  const depth = dims.torsoHalfDepth + looseness + 0.008;
  const top = dims.shoulderHeight + 0.04;
  const bottom = dims.hipHeight + 0.06;
  const segments = 3;
  const verts: GarmentVertex[] = [];
  const indices: number[] = [];

  // Front (split into left/right panels for lapel gap)
  const lapGap = 0.008;
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(-chest, top, depth),
    vec3(-lapGap, top, depth),
    vec3(-waist, bottom, depth),
    vec3(-waist, bottom, depth),
  );
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(lapGap, top, depth),
    vec3(chest, top, depth),
    vec3(waist, bottom, depth),
    vec3(waist, bottom, depth),
  );
  // Back
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(chest, top, -depth),
    vec3(-chest, top, -depth),
    vec3(-waist, bottom, -depth),
    vec3(waist, bottom, -depth),
  );
  // Left
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(-chest, top, -depth),
    vec3(-chest, top, depth),
    vec3(-waist, bottom, depth),
    vec3(-waist, bottom, -depth),
  );
  // Right
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(chest, top, depth),
    vec3(chest, top, -depth),
    vec3(waist, bottom, -depth),
    vec3(waist, bottom, depth),
  );
  // Top
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(-chest, top, -depth),
    vec3(chest, top, -depth),
    vec3(chest, top, depth),
    vec3(-chest, top, depth),
  );

  return { id, kind: 'jacket', vertices: verts, indices: Uint32Array.from(indices), color };
}

function makeHat(
  id: string,
  dims: AnatomyDimensions,
  looseness: number,
  color: [number, number, number],
): GarmentMesh {
  const headR = dims.headScale * 0.09 + looseness;
  const headCenter = dims.shoulderHeight + dims.headScale * 0.09;
  const segments = 4;
  const verts: GarmentVertex[] = [];
  const indices: number[] = [];

  // Crown (dome): half-sphere from 4 quads stacked
  const layers = 3;
  for (let ly = 0; ly < layers; ly++) {
    const t0 = ly / layers;
    const t1 = (ly + 1) / layers;
    const r0 = Math.cos(t0 * Math.PI * 0.5) * headR;
    const r1 = Math.cos(t1 * Math.PI * 0.5) * headR;
    const y0 = headCenter + Math.sin(t0 * Math.PI * 0.5) * headR;
    const y1 = headCenter + Math.sin(t1 * Math.PI * 0.5) * headR;
    const prevCount = verts.length;
    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * Math.PI * 2;
      const a1 = ((s + 1) / segments) * Math.PI * 2;
      const u0 = s / segments,
        u1 = (s + 1) / segments;
      verts.push(
        { position: vec3(Math.cos(a0) * r0, y0, Math.sin(a0) * r0), uv: { u: u0, v: t0 } },
        { position: vec3(Math.cos(a1) * r0, y0, Math.sin(a1) * r0), uv: { u: u1, v: t0 } },
        { position: vec3(Math.cos(a1) * r1, y1, Math.sin(a1) * r1), uv: { u: u1, v: t1 } },
        { position: vec3(Math.cos(a0) * r1, y1, Math.sin(a0) * r1), uv: { u: u0, v: t1 } },
      );
      const base = prevCount + s * 4;
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // Brim ring
  const brimR = headR + 0.03;
  const brimY = headCenter;
  const brimThick = 0.004;
  const brimBase = verts.length;
  for (let s = 0; s < segments; s++) {
    const a0 = (s / segments) * Math.PI * 2;
    const a1 = ((s + 1) / segments) * Math.PI * 2;
    const u0 = s / segments,
      u1 = (s + 1) / segments;
    verts.push(
      {
        position: vec3(Math.cos(a0) * headR, brimY + brimThick, Math.sin(a0) * headR),
        uv: { u: u0, v: 0 },
      },
      {
        position: vec3(Math.cos(a1) * headR, brimY + brimThick, Math.sin(a1) * headR),
        uv: { u: u1, v: 0 },
      },
      { position: vec3(Math.cos(a1) * brimR, brimY, Math.sin(a1) * brimR), uv: { u: u1, v: 1 } },
      { position: vec3(Math.cos(a0) * brimR, brimY, Math.sin(a0) * brimR), uv: { u: u0, v: 1 } },
    );
    const base = brimBase + s * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return { id, kind: 'hat', vertices: verts, indices: Uint32Array.from(indices), color };
}

function makeShoes(
  id: string,
  dims: AnatomyDimensions,
  looseness: number,
  color: [number, number, number],
): GarmentMesh {
  const shoeL = dims.headScale * 0.13 + looseness;
  const shoeW = dims.headScale * 0.05 + looseness * 0.5;
  const shoeH = dims.headScale * 0.05 + looseness * 0.3;
  const soleY = dims.footOffsetY;
  const topY = soleY + shoeH;
  const toeX = shoeL * 0.5;
  const heelX = -shoeL * 0.35;
  const segments = 2;
  const verts: GarmentVertex[] = [];
  const indices: number[] = [];

  // Top face
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(heelX, topY, -shoeW),
    vec3(toeX, topY, -shoeW),
    vec3(toeX, topY, shoeW),
    vec3(heelX, topY, shoeW),
  );
  // Front face (toe cap)
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(toeX, topY, -shoeW),
    vec3(toeX, topY, shoeW),
    vec3(toeX, soleY, shoeW),
    vec3(toeX, soleY, -shoeW),
  );
  // Back face (heel)
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(heelX, topY, shoeW),
    vec3(heelX, topY, -shoeW),
    vec3(heelX, soleY, -shoeW),
    vec3(heelX, soleY, shoeW),
  );
  // Left
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(heelX, topY, -shoeW),
    vec3(toeX, topY, -shoeW),
    vec3(toeX, soleY, -shoeW),
    vec3(heelX, soleY, -shoeW),
  );
  // Right
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(toeX, topY, shoeW),
    vec3(heelX, topY, shoeW),
    vec3(heelX, soleY, shoeW),
    vec3(toeX, soleY, shoeW),
  );
  // Bottom
  subdividedQuad(
    verts,
    indices,
    segments,
    vec3(heelX, soleY, shoeW),
    vec3(toeX, soleY, shoeW),
    vec3(toeX, soleY, -shoeW),
    vec3(heelX, soleY, -shoeW),
  );

  return { id, kind: 'shoes', vertices: verts, indices: Uint32Array.from(indices), color };
}

// ---------------------------------------------------------------------------
// Internal: geometry utilities
// ---------------------------------------------------------------------------

/** Subdivide a single quad into segmentsÃ—segments smaller quads with bilinear UV. */
function subdividedQuad(
  verts: GarmentVertex[],
  indexOut: number[],
  segments: number,
  tl: Vec3,
  tr: Vec3,
  br: Vec3,
  bl: Vec3,
): void {
  const base = verts.length;
  for (let row = 0; row <= segments; row++) {
    const tv = row / segments;
    for (let col = 0; col <= segments; col++) {
      const tu = col / segments;
      // Bilinear interpolation of position
      const x =
        (1 - tu) * (1 - tv) * tl.x + tu * (1 - tv) * tr.x + tu * tv * br.x + (1 - tu) * tv * bl.x;
      const y =
        (1 - tu) * (1 - tv) * tl.y + tu * (1 - tv) * tr.y + tu * tv * br.y + (1 - tu) * tv * bl.y;
      const z =
        (1 - tu) * (1 - tv) * tl.z + tu * (1 - tv) * tr.z + tu * tv * br.z + (1 - tu) * tv * bl.z;
      verts.push({ position: vec3(x, y, z), uv: { u: tu, v: tv } });
    }
  }
  const cols = segments + 1;
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const i0 = base + row * cols + col;
      const i1 = i0 + 1;
      const i2 = i0 + cols + 1;
      const i3 = i0 + cols;
      indexOut.push(i0, i1, i2, i0, i2, i3);
    }
  }
}

function quadIndices(quadCount: number): Uint32Array {
  const out: number[] = [];
  for (let q = 0; q < quadCount; q++) {
    const i = q * 4;
    out.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  return Uint32Array.from(out);
}

function v(x: number, y: number, z: number, u: number, vv: number): GarmentVertex {
  return { position: vec3(x, y, z), uv: { u, v: vv } };
}

function numberData(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorData(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')) {
    return [clamp01(value[0]), clamp01(value[1]), clamp01(value[2])];
  }
  return fallback;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function pseudoHash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------
// Internal: LOD decimation
// ---------------------------------------------------------------------------

/** Decimate a render mesh by keeping fraction of vertices (nearestâ€‘toâ€‘grid). */
function decimateRenderMesh(mesh: GarmentRenderMesh, fraction: number): GarmentRenderMesh {
  const keepCount = Math.max(4, Math.floor(mesh.vertexCount * fraction));
  const gridStep = Math.ceil(Math.sqrt(keepCount));
  const step = Math.max(1, Math.floor(mesh.vertexCount / gridStep));

  const indexMap = new Map<number, number>();
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const newUvs: number[] = [];
  let newIdx = 0;

  for (let i = 0; i < mesh.vertexCount; i += step) {
    indexMap.set(i, newIdx++);
    newPositions.push(mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]);
    newNormals.push(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
    newUvs.push(mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]);
  }

  const newIndices: number[] = [];
  for (let t = 0; t < mesh.indexCount; t += 3) {
    const a = indexMap.get(mesh.indices[t]);
    const b = indexMap.get(mesh.indices[t + 1]);
    const c = indexMap.get(mesh.indices[t + 2]);
    if (a !== undefined && b !== undefined && c !== undefined) {
      newIndices.push(a, b, c);
    }
  }

  const vc = newPositions.length / 3;
  return {
    id: mesh.id,
    kind: mesh.kind,
    positions: Float32Array.from(newPositions),
    normals: Float32Array.from(newNormals),
    uvs: Float32Array.from(newUvs),
    indices: Uint32Array.from(newIndices),
    color: mesh.color,
    vertexCount: vc,
    indexCount: newIndices.length,
  };
}

/** Decimate a physics mesh to match a fraction of original particle count. */
function decimatePhysicsMesh(mesh: GarmentPhysicsMesh, fraction: number): GarmentPhysicsMesh {
  const keepCount = Math.max(4, Math.floor(mesh.particles.length * fraction));
  const step = Math.max(1, Math.floor(mesh.particles.length / keepCount));

  const indexMap = new Map<number, number>();
  const particles: ClothParticle[] = [];
  let newIdx = 0;

  for (let i = 0; i < mesh.particles.length; i += step) {
    indexMap.set(i, newIdx++);
    const p = mesh.particles[i];
    particles.push({
      position: { ...p.position },
      previousPosition: { ...p.previousPosition },
      acceleration: { ...p.acceleration },
      mass: p.mass,
      pinned: p.pinned,
    });
  }

  const constraints: ClothConstraint[] = [];
  for (const c of mesh.constraints) {
    const a = indexMap.get(c.a);
    const b = indexMap.get(c.b);
    if (a !== undefined && b !== undefined) {
      constraints.push({ a, b, restLength: c.restLength, stiffness: c.stiffness });
    }
  }

  const triangleParticleMap: [number, number, number][] = [];
  for (const tri of mesh.triangleParticleMap) {
    const a = indexMap.get(tri[0]);
    const b = indexMap.get(tri[1]);
    const c = indexMap.get(tri[2]);
    if (a !== undefined && b !== undefined && c !== undefined) {
      triangleParticleMap.push([a, b, c]);
    }
  }

  return {
    id: mesh.id,
    kind: mesh.kind,
    particles,
    constraints,
    triangleParticleMap,
    gravity: { ...mesh.gravity },
    damping: mesh.damping,
  };
}
