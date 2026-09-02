import { HumanSdfField } from "../sdf/human-sdf";
import { Vec3, vec3 } from "../../core/math/vec";

export interface ClothParticle {
  position: Vec3;
  previous: Vec3;
  pinned: boolean;
}

export interface ClothConstraint {
  a: number;
  b: number;
  restLength: number;
}

export interface ClothMesh {
  width: number;
  height: number;
  particles: ClothParticle[];
  constraints: ClothConstraint[];
}

export interface ClothStepOptions {
  dt?: number;
  gravity?: Vec3;
  iterations?: number;
  collisionPadding?: number;
}

export interface ClothWindConfig {
  direction: Vec3;
  strength: number;
  turbulence: number;
}

export interface CollisionPrimitive {
  kind: "sphere" | "capsule";
  center: Vec3;
  end?: Vec3;
  radius: number;
}

export interface ClothSimConfig {
  gravity: Vec3;
  dt: number;
  iterations: number;
  collisionPadding: number;
  damping: number;
  stiffness: number;
  tearThreshold: number;
  selfCollisionRadius: number;
  wind: ClothWindConfig;
  collisionPrimitives: CollisionPrimitive[];
}

const DEFAULT_WIND: ClothWindConfig = {
  direction: vec3(1, 0, 0),
  strength: 0,
  turbulence: 0,
};

const DEFAULT_CONFIG: ClothSimConfig = {
  gravity: vec3(0, -9.8, 0),
  dt: 1 / 60,
  iterations: 4,
  collisionPadding: 0.012,
  damping: 0.99,
  stiffness: 1.0,
  tearThreshold: 0,
  selfCollisionRadius: 0,
  wind: DEFAULT_WIND,
  collisionPrimitives: [],
};

// Seeded PRNG for deterministic turbulence (xorshift32)
let _turbSeed = 1;

function turbRand(): number {
  _turbSeed ^= _turbSeed << 13;
  _turbSeed ^= _turbSeed >> 17;
  _turbSeed ^= _turbSeed << 5;
  return (_turbSeed >>> 0) / 4294967296;
}

export function seedTurbulence(seed: number): void {
  _turbSeed = seed | 0 || 1;
}

/** Build a deterministic poncho/shirt-front cloth panel pinned near shoulders. */
export function createTorsoCloth(width = 8, height = 10): ClothMesh {
  const particles: ClothParticle[] = [];
  const constraints: ClothConstraint[] = [];
  const dx = 0.08;
  const dy = 0.07;
  const x0 = -((width - 1) * dx) / 2;
  const y0 = 1.82;
  const z = 0.28;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = vec3(x0 + x * dx, y0 - y * dy, z);
      particles.push({ position: p, previous: { ...p }, pinned: y === 0 && (x === 0 || x === width - 1) });
    }
  }

  const add = (a: number, b: number) => {
    constraints.push({ a, b, restLength: distance(particles[a].position, particles[b].position) });
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x + 1 < width) add(i, i + 1);
      if (y + 1 < height) add(i, i + width);
    }
  }

  return { width, height, particles, constraints };
}

export function stepCloth(mesh: ClothMesh, sdf: HumanSdfField, options: ClothStepOptions = {}): ClothMesh {
  const config: ClothSimConfig = {
    ...DEFAULT_CONFIG,
    ...options,
    wind: DEFAULT_WIND,
    collisionPrimitives: [],
  };
  return stepClothAdvanced(mesh, sdf, config);
}

export function stepClothAdvanced(mesh: ClothMesh, sdf: HumanSdfField, config: ClothSimConfig): ClothMesh {
  const { dt, gravity, iterations, collisionPadding, damping, stiffness, tearThreshold, selfCollisionRadius, wind, collisionPrimitives } = config;
  const next = cloneCloth(mesh);
  const wDir = length(wind.direction) > 0 ? normalize(wind.direction) : vec3();

  for (const p of next.particles) {
    if (p.pinned) continue;
    const pos = { ...p.position };
    const vx = (p.position.x - p.previous.x) * damping;
    const vy = (p.position.y - p.previous.y) * damping;
    const vz = (p.position.z - p.previous.z) * damping;

    let fx = gravity.x;
    let fy = gravity.y;
    let fz = gravity.z;

    if (wind.strength > 0) {
      const turbX = (turbRand() - 0.5) * 2 * wind.turbulence;
      const turbY = (turbRand() - 0.5) * 2 * wind.turbulence;
      const turbZ = (turbRand() - 0.5) * 2 * wind.turbulence;
      fx += wDir.x * wind.strength + turbX;
      fy += wDir.y * wind.strength + turbY;
      fz += wDir.z * wind.strength + turbZ;
    }

    p.position = vec3(
      p.position.x + vx + fx * dt * dt,
      p.position.y + vy + fy * dt * dt,
      p.position.z + vz + fz * dt * dt
    );
    p.previous = pos;
  }

  const live = new Uint8Array(next.constraints.length);
  live.fill(1);

  for (let i = 0; i < iterations; i++) {
    satisfyConstraints(next, stiffness, tearThreshold, live);
    collideSdf(next, sdf, collisionPadding);
    collidePrimitives(next, collisionPrimitives, collisionPadding);
    if (selfCollisionRadius > 0) {
      avoidSelfCollision(next, selfCollisionRadius);
    }
  }

  removeBrokenConstraints(next, live);
  return next;
}

export function simulateCloth(mesh: ClothMesh, sdf: HumanSdfField, steps: number, options: ClothStepOptions = {}): ClothMesh {
  let current = mesh;
  for (let i = 0; i < steps; i++) current = stepCloth(current, sdf, options);
  return current;
}

export function simulateClothAdvanced(mesh: ClothMesh, sdf: HumanSdfField, steps: number, config: ClothSimConfig): ClothMesh {
  let current = mesh;
  for (let i = 0; i < steps; i++) current = stepClothAdvanced(current, sdf, config);
  return current;
}

export function cloneCloth(mesh: ClothMesh): ClothMesh {
  return {
    width: mesh.width,
    height: mesh.height,
    particles: mesh.particles.map((p) => ({ position: { ...p.position }, previous: { ...p.previous }, pinned: p.pinned })),
    constraints: mesh.constraints.map((c) => ({ ...c })),
  };
}

export function clothToGPUBuffer(mesh: ClothMesh): Float32Array {
  const n = mesh.particles.length;
  const buf = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = mesh.particles[i];
    buf[i * 3] = p.position.x;
    buf[i * 3 + 1] = p.position.y;
    buf[i * 3 + 2] = p.position.z;
  }
  return buf;
}

export function clothConstraintsToGPUBuffer(mesh: ClothMesh): Uint32Array {
  const buf = new Uint32Array(mesh.constraints.length * 2);
  for (let i = 0; i < mesh.constraints.length; i++) {
    const c = mesh.constraints[i];
    buf[i * 2] = c.a;
    buf[i * 2 + 1] = c.b;
  }
  return buf;
}

export function clothRestLengthsToGPUBuffer(mesh: ClothMesh): Float32Array {
  const buf = new Float32Array(mesh.constraints.length);
  for (let i = 0; i < mesh.constraints.length; i++) {
    buf[i] = mesh.constraints[i].restLength;
  }
  return buf;
}

export function meshToGPULayout(mesh: ClothMesh): {
  positions: Float32Array;
  previous: Float32Array;
  constraintIndices: Uint32Array;
  restLengths: Float32Array;
  pinnedMask: Uint8Array;
  count: number;
  constraintCount: number;
} {
  const n = mesh.particles.length;
  const m = mesh.constraints.length;
  const positions = new Float32Array(n * 3);
  const previous = new Float32Array(n * 3);
  const pinnedMask = new Uint8Array(n);
  const constraintIndices = new Uint32Array(m * 2);
  const restLengths = new Float32Array(m);

  for (let i = 0; i < n; i++) {
    const p = mesh.particles[i];
    positions[i * 3] = p.position.x;
    positions[i * 3 + 1] = p.position.y;
    positions[i * 3 + 2] = p.position.z;
    previous[i * 3] = p.previous.x;
    previous[i * 3 + 1] = p.previous.y;
    previous[i * 3 + 2] = p.previous.z;
    pinnedMask[i] = p.pinned ? 1 : 0;
  }
  for (let i = 0; i < m; i++) {
    constraintIndices[i * 2] = mesh.constraints[i].a;
    constraintIndices[i * 2 + 1] = mesh.constraints[i].b;
    restLengths[i] = mesh.constraints[i].restLength;
  }

  return { positions, previous, constraintIndices, restLengths, pinnedMask, count: n, constraintCount: m };
}

export function meshFromGPULayout(layout: {
  positions: Float32Array;
  previous: Float32Array;
  constraintIndices: Uint32Array;
  restLengths: Float32Array;
  pinnedMask: Uint8Array;
  count: number;
  constraintCount: number;
}): ClothMesh {
  const particles: ClothParticle[] = [];
  for (let i = 0; i < layout.count; i++) {
    particles.push({
      position: vec3(layout.positions[i * 3], layout.positions[i * 3 + 1], layout.positions[i * 3 + 2]),
      previous: vec3(layout.previous[i * 3], layout.previous[i * 3 + 1], layout.previous[i * 3 + 2]),
      pinned: layout.pinnedMask[i] === 1,
    });
  }
  const constraints: ClothConstraint[] = [];
  for (let i = 0; i < layout.constraintCount; i++) {
    constraints.push({
      a: layout.constraintIndices[i * 2],
      b: layout.constraintIndices[i * 2 + 1],
      restLength: layout.restLengths[i],
    });
  }
  return { width: 0, height: 0, particles, constraints };
}

function satisfyConstraints(mesh: ClothMesh, stiffness: number, tearThreshold: number, live: Uint8Array): void {
  for (let ci = 0; ci < mesh.constraints.length; ci++) {
    if (!live[ci]) continue;
    const c = mesh.constraints[ci];
    const a = mesh.particles[c.a];
    const b = mesh.particles[c.b];
    const delta = sub(b.position, a.position);
    const len = length(delta) || 1;

    if (tearThreshold > 0 && len > c.restLength * tearThreshold) {
      live[ci] = 0;
      continue;
    }

    const correction = scale(delta, (len - c.restLength) / len * 0.5 * stiffness);
    if (!a.pinned) a.position = add(a.position, correction);
    if (!b.pinned) b.position = sub(b.position, correction);
  }
}

function removeBrokenConstraints(mesh: ClothMesh, live: Uint8Array): void {
  mesh.constraints = mesh.constraints.filter((_, i) => live[i] === 1);
}

function collideSdf(mesh: ClothMesh, sdf: HumanSdfField, padding: number): void {
  for (const p of mesh.particles) {
    if (p.pinned) continue;
    const sample = sdf.sample(p.position);
    if (sample.distance >= padding) continue;
    const n = estimateNormal(sdf, p.position);
    const push = padding - sample.distance;
    p.position = add(p.position, scale(n, push));
  }
}

function collidePrimitives(mesh: ClothMesh, primitives: CollisionPrimitive[], padding: number): void {
  for (const p of mesh.particles) {
    if (p.pinned) continue;
    for (const prim of primitives) {
      if (prim.kind === "sphere") {
        sphereCollide(p, prim, padding);
      } else {
        capsuleCollide(p, prim, padding);
      }
    }
  }
}

function sphereCollide(p: ClothParticle, prim: CollisionPrimitive, padding: number): void {
  const d = sub(p.position, prim.center);
  const dist = length(d);
  const minDist = prim.radius + padding;
  if (dist >= minDist || dist < 1e-8) return;
  const n = scale(d, 1 / dist);
  p.position = add(prim.center, scale(n, minDist));
}

function capsuleCollide(p: ClothParticle, prim: CollisionPrimitive, padding: number): void {
  const a = prim.center;
  const b = prim.end ?? prim.center;
  const pa = sub(p.position, a);
  const ba = sub(b, a);
  const baLen2 = dot(ba, ba);
  const h = clamp(dot(pa, ba) / Math.max(baLen2, 1e-8), 0, 1);
  const closest = add(a, scale(ba, h));
  const d = sub(p.position, closest);
  const dist = length(d);
  const minDist = prim.radius + padding;
  if (dist >= minDist || dist < 1e-8) return;
  const n = scale(d, 1 / dist);
  p.position = add(closest, scale(n, minDist));
}

function avoidSelfCollision(mesh: ClothMesh, radius: number): void {
  const r2 = radius * radius;
  const particles = mesh.particles;
  const n = particles.length;
  for (let i = 0; i < n; i++) {
    const pi = particles[i];
    if (pi.pinned) continue;
    for (let j = i + 1; j < n; j++) {
      const pj = particles[j];
      const dx = pi.position.x - pj.position.x;
      const dy = pi.position.y - pj.position.y;
      const dz = pi.position.z - pj.position.z;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 >= r2 || dist2 < 1e-10) continue;
      const dist = Math.sqrt(dist2);
      const push = (radius - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      if (!pi.pinned) {
        pi.position = vec3(pi.position.x + nx * push, pi.position.y + ny * push, pi.position.z + nz * push);
      }
      if (!pj.pinned) {
        pj.position = vec3(pj.position.x - nx * push, pj.position.y - ny * push, pj.position.z - nz * push);
      }
    }
  }
}

function estimateNormal(sdf: HumanSdfField, p: Vec3): Vec3 {
  const e = 0.003;
  const nx = sdf.distance(vec3(p.x + e, p.y, p.z)) - sdf.distance(vec3(p.x - e, p.y, p.z));
  const ny = sdf.distance(vec3(p.x, p.y + e, p.z)) - sdf.distance(vec3(p.x, p.y - e, p.z));
  const nz = sdf.distance(vec3(p.x, p.y, p.z + e)) - sdf.distance(vec3(p.x, p.y, p.z - e));
  const l = Math.hypot(nx, ny, nz) || 1;
  return vec3(nx / l, ny / l, nz / l);
}

function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(a: Vec3, s: number): Vec3 {
  return vec3(a.x * s, a.y * s, a.z * s);
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return vec3(a.x / l, a.y / l, a.z / l);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
