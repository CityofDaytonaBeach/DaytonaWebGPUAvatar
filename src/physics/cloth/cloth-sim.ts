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
  const dt = options.dt ?? 1 / 60;
  const gravity = options.gravity ?? vec3(0, -9.8, 0);
  const iterations = Math.max(1, Math.floor(options.iterations ?? 4));
  const collisionPadding = options.collisionPadding ?? 0.012;
  const next = cloneCloth(mesh);

  for (const p of next.particles) {
    if (p.pinned) continue;
    const pos = { ...p.position };
    const vx = p.position.x - p.previous.x;
    const vy = p.position.y - p.previous.y;
    const vz = p.position.z - p.previous.z;
    p.position = vec3(
      p.position.x + vx + gravity.x * dt * dt,
      p.position.y + vy + gravity.y * dt * dt,
      p.position.z + vz + gravity.z * dt * dt
    );
    p.previous = pos;
  }

  for (let i = 0; i < iterations; i++) {
    satisfyConstraints(next);
    collide(next, sdf, collisionPadding);
  }

  return next;
}

export function simulateCloth(mesh: ClothMesh, sdf: HumanSdfField, steps: number, options: ClothStepOptions = {}): ClothMesh {
  let current = mesh;
  for (let i = 0; i < steps; i++) current = stepCloth(current, sdf, options);
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

function satisfyConstraints(mesh: ClothMesh): void {
  for (const c of mesh.constraints) {
    const a = mesh.particles[c.a];
    const b = mesh.particles[c.b];
    const delta = sub(b.position, a.position);
    const len = length(delta) || 1;
    const correction = scale(delta, (len - c.restLength) / len * 0.5);
    if (!a.pinned) a.position = add(a.position, correction);
    if (!b.pinned) b.position = sub(b.position, correction);
  }
}

function collide(mesh: ClothMesh, sdf: HumanSdfField, padding: number): void {
  for (const p of mesh.particles) {
    if (p.pinned) continue;
    const sample = sdf.sample(p.position);
    if (sample.distance >= padding) continue;
    const n = estimateNormal(sdf, p.position);
    const push = padding - sample.distance;
    p.position = add(p.position, scale(n, push));
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
