import { HumanDefinition } from '../../core/schema/human-definition.js';
import { Vec3, vec3 } from '../../core/math/vec.js';
import { CanonicalHuman, Vertex } from '../../geometry/canonical/canonical-human.js';

export interface HairStrandPoint {
  position: Vec3;
  radius: number;
}

export interface HairStrand {
  id: number;
  rootVertexId: number;
  points: HairStrandPoint[];
}

export interface StrandHairGeometry {
  strands: HairStrand[];
  color: [number, number, number];
}

export interface StrandHairOptions {
  maxStrands?: number;
  segments?: number;
}

/**
 * Deterministic prototype strand-hair runtime. It samples stable scalp anchors
 * from the canonical head and expands HDL hair parameters into strand polylines.
 */
export function generateStrandHair(
  definition: HumanDefinition,
  canonical: CanonicalHuman,
  options: StrandHairOptions = {},
): StrandHairGeometry {
  const maxStrands = Math.max(0, Math.floor(options.maxStrands ?? 96));
  const segments = Math.max(2, Math.floor(options.segments ?? 5));
  const length = definition.get('hair.length');
  const density = definition.get('hair.density');
  const curl = definition.get('hair.curl');
  const gray = definition.get('hair.gray');
  const color = mixColor(
    [definition.get('hair.colorR'), definition.get('hair.colorG'), definition.get('hair.colorB')],
    [0.62, 0.62, 0.62],
    gray,
  );

  if (length <= 0 || density <= 0 || maxStrands === 0) return { strands: [], color };

  const anchors = scalpAnchors(canonical);
  const count = Math.min(anchors.length, Math.max(1, Math.round(maxStrands * density)));
  const strands: HairStrand[] = [];
  for (let i = 0; i < count; i++) {
    const anchor = anchors[Math.floor((i * anchors.length) / count)];
    strands.push(makeStrand(i, anchor, length, curl, segments));
  }
  return { strands, color };
}

export function countHairVertices(hair: StrandHairGeometry): number {
  return hair.strands.reduce((sum, strand) => sum + strand.points.length, 0);
}

// ---------------------------------------------------------------------------
// Clumping
// ---------------------------------------------------------------------------

/** A group of nearby strands that move/share volume together. */
export interface HairClump {
  /** Id of the clump (stable ordering across the scalp). */
  id: number;
  /** Mean root position of every member strand. */
  center: Vec3;
  /** Strand ids in this clump. */
  strandIds: number[];
  /** Per-strand membership bias in [0,1]; 0 = peripheral, 1 = core strand. */
  bias: number;
}

export interface ClumpOptions {
  /** Number of clumps to form (defaults to ~15% of strand count). */
  clumps?: number;
  /** Seed for deterministic binning of strands into clumps. */
  seed?: number;
}

/**
 * Deterministically bin the strands in a geometry into local clumps by their
 * root direction around the scalp center. Strands are sorted into an azimuthal
 * order and split into contiguous buckets so members are always neighbours.
 */
export function clumpStrands(hair: StrandHairGeometry, options: ClumpOptions = {}): HairClump[] {
  if (hair.strands.length === 0) return [];

  const centroid = hair.strands.reduce((acc, s) => add(acc, s.points[0].position), vec3());
  const center = scale(centroid, 1 / hair.strands.length);

  // Order strands by azimuth around the scalp centroid (stable, tie-broken by id).
  const ordered = hair.strands
    .map((s) => ({
      s,
      a: Math.atan2(s.points[0].position.z - center.z, s.points[0].position.x - center.x),
    }))
    .sort((p, q) => p.a - q.a || p.s.id - q.s.id);

  const clampCount = Math.max(
    1,
    Math.min(
      hair.strands.length,
      Math.floor(options.clumps ?? Math.max(1, Math.round(hair.strands.length * 0.15))),
    ),
  );

  const rng = mulberry32(options.seed ?? 0);
  const stride = hair.strands.length / clampCount;
  const clumps: HairClump[] = [];
  for (let c = 0; c < clampCount; c++) {
    let start = Math.floor(c * stride);
    let end = Math.floor((c + 1) * stride);
    if (c === clampCount - 1) end = hair.strands.length;
    if (end <= start) {
      start = Math.min(start, hair.strands.length - 1);
      end = start + 1;
    }
    const members = ordered.slice(start, end);
    const strandIds = members.map((m) => m.s.id);
    const cCenter = members.reduce((acc, m) => add(acc, m.s.points[0].position), vec3());
    const clumpCenter = scale(cCenter, 1 / members.length);
    // Deterministic jitter so core/bias is stable but varied across clumps.
    const jitter = rng();
    clumps.push({
      id: c,
      center: clumpCenter,
      strandIds,
      bias: 0.35 + jitter * 0.3,
    });
  }
  return clumps;
}

// ---------------------------------------------------------------------------
// Thickness tapering
// ---------------------------------------------------------------------------

export interface ThicknessTaper {
  /** Radius at the root. */
  rootRadius: number;
  /** Radius at the tip. */
  tipRadius: number;
}

export interface TaperOptions {
  taper?: ThicknessTaper;
  /** Exponent shaping the falloff; 1 = linear, >1 = tip-heavy. */
  curve?: number;
}

/**
 * Re-radiusing every strand between an explicit root and tip thickness,
 * shaped by a power curve. Fully deterministic and returns a new geometry
 * without mutating the input.
 */
export function taperStrandThickness(
  hair: StrandHairGeometry,
  options: TaperOptions = {},
): StrandHairGeometry {
  const taper = options.taper ?? { rootRadius: 0.004, tipRadius: 0.001 };
  const curve = Math.max(0.001, options.curve ?? 1);

  const strands = hair.strands.map((s) => {
    const n = s.points.length;
    const points = s.points.map((p, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const shaped = Math.pow(t, curve);
      return {
        position: p.position,
        radius: taper.rootRadius * (1 - shaped) + taper.tipRadius * shaped,
      };
    });
    return { id: s.id, rootVertexId: s.rootVertexId, points };
  });

  return { strands, color: hair.color };
}

// ---------------------------------------------------------------------------
// Wind perturbation
// ---------------------------------------------------------------------------

export interface WindField {
  /** Base wind direction/velocity. */
  direction: Vec3;
  /** Overall strength multiplier. */
  strength: number;
}

export interface WindOptions {
  /** Wind gust magnitude along the field. */
  gusts?: number;
  /** Angular/phase offset applied per strand, driven by time. */
  frequency?: number;
  /** Deterministic seed for strand phase offsets. */
  seed?: number;
}

/**
 * Apply a time-varying wind perturbation to every strand. Offsets are a product
 * of the strand's seed phase and its normalized height so tips sway more than
 * roots. Returns a new geometry; the input is never mutated.
 */
export function applyHairWind(
  hair: StrandHairGeometry,
  wind: WindField,
  time: number,
  options: WindOptions = {},
): StrandHairGeometry {
  const gusts = Math.max(0, options.gusts ?? 0.5);
  const frequency = Math.max(0, options.frequency ?? 2);
  const rng = mulberry32(options.seed ?? 1);

  const strands = hair.strands.map((s) => {
    const phase = rng() * Math.PI * 2;
    const n = s.points.length;
    const points = s.points.map((p, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const sway = (1 + Math.sin(t * Math.PI - Math.PI / 2)) / 2; // 0 at root, 1 at tip
      const gust = 1 + Math.sin(time * frequency + phase) * gusts;
      const amp = wind.strength * sway * gust;
      return {
        position: vec3(
          p.position.x + wind.direction.x * amp,
          p.position.y + wind.direction.y * amp,
          p.position.z + wind.direction.z * amp,
        ),
        radius: p.radius,
      };
    });
    return { id: s.id, rootVertexId: s.rootVertexId, points };
  });

  return { strands, color: hair.color };
}

// ---------------------------------------------------------------------------
// LOD strand reduction
// ---------------------------------------------------------------------------

export type HairLodLevel = 0 | 1 | 2 | 3;

/** Per-LOD hardware/CPU budgets used when no explicit cap is supplied. */
export const HAIR_LOD_BUDGETS: Record<HairLodLevel, number> = {
  0: 320,
  1: 220,
  2: 140,
  3: 70,
};

export interface LodOptions {
  /** Hard cap on strand count; defaults to HAIR_LOD_BUDGETS[level]. */
  maxStrands?: number;
}

/**
 * Reduce strand count for a level of detail while preserving root distribution
 * exactly like the generator (uniform decimation over the sorted anchor space).
 * Returned geometry is a new object and stays deterministic.
 */
export function reduceStrandsForLOD(
  hair: StrandHairGeometry,
  level: HairLodLevel,
  options: LodOptions = {},
): StrandHairGeometry {
  const maxStrands = Math.max(0, options.maxStrands ?? HAIR_LOD_BUDGETS[level]);
  if (hair.strands.length <= maxStrands) return hair;
  if (maxStrands === 0) return { strands: [], color: hair.color };

  const order = hair.strands.slice().sort((a, b) => a.id - b.id);
  const strands: HairStrand[] = [];
  for (let i = 0; i < maxStrands; i++) {
    strands.push(order[Math.floor((i * order.length) / maxStrands)]);
  }
  return { strands, color: hair.color };
}

// ---------------------------------------------------------------------------
// Per-strand color variation
// ---------------------------------------------------------------------------

export interface HairColorOption {
  /** Base RGB color (unvarying component). Defaults to the geometry color. */
  base?: [number, number, number];
  /** Max per-channel deviance applied around the base. */
  variance?: number;
  /** Deterministic seed for the variation stream. */
  seed?: number;
}

/** Per-strand resolved color, keyed by strand id. */
export type StrandColorMap = Map<number, [number, number, number]>;

/**
 * Deterministically assign a slightly varied color to every strand. The first
 * color in the stream is always the unvarying base so the primary hair color
 * is preserved; subsequent strands get bounded, seeded deviance.
 */
export function strandColors(
  hair: StrandHairGeometry,
  options: HairColorOption = {},
): StrandColorMap {
  const variance = Math.max(0, options.variance ?? 0.02);
  const base = options.base ?? hair.color;
  const rng = mulberry32(options.seed ?? 7);
  const map: StrandColorMap = new Map();
  hair.strands.forEach((s, index) => {
    let c: [number, number, number];
    if (index === 0) {
      c = base;
    } else {
      c = [
        clamp01(base[0] + (rng() * 2 - 1) * variance),
        clamp01(base[1] + (rng() * 2 - 1) * variance),
        clamp01(base[2] + (rng() * 2 - 1) * variance),
      ];
    }
    map.set(s.id, c);
  });
  return map;
}

// ---------------------------------------------------------------------------
// Card / ribbon triangle mesh generation
// ---------------------------------------------------------------------------

/** A single corner of a hair card (ribbon segment). */
export interface HairCardVertex {
  position: Vec3;
  /** UV: u across the ribbon width, v along strand length (0 root â†’ 1 tip). */
  uv: { u: number; v: number };
  strandId: number;
}

/** A quad ribbon segment bridging two consecutive strand points. */
export interface HairCard {
  a: HairCardVertex;
  b: HairCardVertex;
  c: HairCardVertex;
  d: HairCardVertex;
}

/** GPU-friendly flattened triangle mesh built from strand cards. */
export interface HairRenderMesh {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Quad cards, one per strand segment (segments Ã— strands). */
  cards: HairCard[];
  vertexCount: number;
  triangleCount: number;
}

export interface HairMeshOptions {
  /** Ribbon width relative to local strand radius (default 2). */
  widthScale?: number;
  /** Direction pair used to orient cards: "face" (toward +z) or "radial". */
  mode?: 'face' | 'radial';
}

/**
 * Build a renderable triangle mesh by turning every strand polyline into a
 * strip of quad "cards" (ribbons). Each quad is split into two triangles. The
 * ribbon nurmally faces the camera via the `face` mode or flares radially from
 * each strand via `radial` mode.
 */
export function buildHairMesh(
  hair: StrandHairGeometry,
  options: HairMeshOptions = {},
): HairRenderMesh {
  const widthScale = Math.max(0.01, options.widthScale ?? 2);
  const mode = options.mode ?? 'face';

  const cards: HairCard[] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const strand of hair.strands) {
    const n = strand.points.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = strand.points[i];
      const p1 = strand.points[i + 1];
      const v = i / (n - 1);

      const tang = normalize(sub(p1.position, p0.position));
      // Perpendicular basis for the ribbon plane.
      const perp =
        mode === 'radial' ? normalize(sub(p0.position, scalpCentroid(hair))) : vec3(0, 0, 1);
      const binorm = normalize(cross(tang, perp));
      const width = (p0.radius + p1.radius) * 0.5 * widthScale;

      const w = scale(binorm, width * 0.5);
      const q0l = sub(p0.position, w);
      const q0r = add(p0.position, w);
      const q1l = sub(p1.position, w);
      const q1r = add(p1.position, w);

      const base = positions.length / 3;
      pushVertex(positions, uvs, q0l, 0, v, strand.id);
      pushVertex(positions, uvs, q0r, 1, v, strand.id);
      pushVertex(positions, uvs, q1l, 0, v + 1 / (n - 1 || 1), strand.id);
      pushVertex(positions, uvs, q1r, 1, v + 1 / (n - 1 || 1), strand.id);

      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);

      cards.push({
        a: { position: q0l, uv: { u: 0, v }, strandId: strand.id },
        b: { position: q0r, uv: { u: 1, v }, strandId: strand.id },
        c: { position: q1l, uv: { u: 0, v: v + 1 / (n - 1 || 1) }, strandId: strand.id },
        d: { position: q1r, uv: { u: 1, v: v + 1 / (n - 1 || 1) }, strandId: strand.id },
      });
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    cards,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

// ---------------------------------------------------------------------------
// Physics-aware strand simulation
// ---------------------------------------------------------------------------

export interface HairSimulationOptions {
  /** Downward acceleration (default {0, -9.81, 0}). */
  gravity?: Vec3;
  /** Velocity damping per step in [0,1] (default 0.92). */
  damping?: number;
  /** Pull toward the rest pose in [0,1] (default 0.35). */
  stiffness?: number;
  /** Ambient wind acting on every non-root particle. */
  wind?: Vec3;
  /** Scalar multiplier on the wind field. */
  windStrength?: number;
  /** Fixed integration time-step in seconds (default 1/60). */
  dt?: number;
  /** Deterministic seed for per-strand phase offsets. */
  seed?: number;
}

/** Mutable state backing one particle of one strand. */
interface Particle {
  position: Vec3;
  prev: Vec3;
  rest: Vec3;
}

/**
 * Deterministic, fixed-timestep spring/gravity strand solver. Each strand is a
 * chain of particles pinned at the root. On every step gravity and wind are
 * integrated, velocity is damped, segment lengths are kept near their rest
 * length, and a small stiffness pulls the chain back toward its rest pose.
 */
export class HairSim {
  readonly strands: HairStrand[];
  private readonly color: [number, number, number];
  private particles: Particle[][];
  private readonly options: Required<HairSimulationOptions>;
  private readonly phase: number[];

  constructor(hair: StrandHairGeometry, options: HairSimulationOptions = {}) {
    this.strands = hair.strands;
    this.color = hair.color;
    this.options = {
      gravity: options.gravity ?? { x: 0, y: -9.81, z: 0 },
      damping: options.damping ?? 0.92,
      stiffness: clamp01(options.stiffness ?? 0.35),
      wind: options.wind ?? vec3(),
      windStrength: options.windStrength ?? 0.0,
      dt: Math.max(1e-4, options.dt ?? 1 / 60),
      seed: options.seed ?? 0,
    };
    const rng = mulberry32(this.options.seed);
    this.phase = hair.strands.map(() => rng() * Math.PI * 2);
    this.particles = hair.strands.map((s) =>
      s.points.map((p) => ({
        position: { ...p.position },
        prev: { ...p.position },
        rest: { ...p.position },
      })),
    );
  }

  get committed(): StrandHairGeometry {
    const strands = this.strands.map((s, si) => ({
      id: s.id,
      rootVertexId: s.rootVertexId,
      points: s.points.map((_, pi) => ({
        position: { ...this.particles[si][pi].position },
        radius: s.points[pi].radius,
      })),
    }));
    return { strands, color: this.color };
  }

  /** Advance the simulation by one fixed timestep. */
  step(): void {
    this.integrate(this.options.dt);
    this.solveConstraints();
  }

  /** Advance by `n` fixed timesteps. */
  steps(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  private integrate(dt: number): void {
    const g = this.options.gravity;
    const dt2 = dt * dt;
    const damp = this.options.damping;
    const windBase = this.options.wind;

    for (let si = 0; si < this.particles.length; si++) {
      const chain = this.particles[si];
      const phase = this.phase[si];
      // Wind gusts varying per strand and over time.
      const gust = 0.5 + 0.5 * Math.sin(phase);
      const wind = {
        x: windBase.x * this.options.windStrength * gust,
        y: windBase.y * this.options.windStrength * gust,
        z: windBase.z * this.options.windStrength * gust,
      };
      for (let pi = 0; pi < chain.length; pi++) {
        const p = chain[pi];
        if (pi === 0) {
          // Root pinned.
          p.prev = { ...p.rest };
          continue;
        }
        const height = pi / (chain.length - 1 || 1);
        const acc = {
          x: g.x + wind.x * height,
          y: g.y + wind.y * height,
          z: g.z + wind.z * height,
        };
        const tmp = { ...p.position };
        p.position.x = tmp.x * (2 - damp) - p.prev.x * (1 - damp) + acc.x * dt2;
        p.position.y = tmp.y * (2 - damp) - p.prev.y * (1 - damp) + acc.y * dt2;
        p.position.z = tmp.z * (2 - damp) - p.prev.z * (1 - damp) + acc.z * dt2;
        p.prev = tmp;
      }
    }
  }

  private solveConstraints(): void {
    const k = this.options.stiffness;
    for (let si = 0; si < this.particles.length; si++) {
      const chain = this.particles[si];
      // Iterative distance-constraint relaxation (deterministic, fixed iterations).
      for (let iter = 0; iter < 4; iter++) {
        for (let pi = 1; pi < chain.length; pi++) {
          const p = chain[pi];
          const prev = chain[pi - 1];
          const restDelta = sub(p.rest, prev.rest);
          const restLen = length(restDelta) || 1e-6;
          const cur = sub(p.position, prev.position);
          const curLen = length(cur) || 1e-6;
          const correction = scale(cur, (curLen - restLen) / curLen);
          // Apply correction split between the moving particle and its support.
          p.position = sub(p.position, scale(correction, 0.6));
          if (pi > 1) prev.position = add(prev.position, scale(correction, 0.4));
          // Rest-pose pull.
          const toRest = sub(p.rest, p.position);
          p.position = add(p.position, scale(toRest, k * 0.08));
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Vec3 helpers (zero-dependency, local to this module)
// ---------------------------------------------------------------------------

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
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1e-6;
  return vec3(a.x / l, a.y / l, a.z / l);
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function pushVertex(
  positions: number[],
  uvs: number[],
  p: Vec3,
  u: number,
  v: number,
  strandId: number,
): void {
  void strandId;
  positions.push(p.x, p.y, p.z);
  uvs.push(u, v);
}

/** Mean of all strand root positions, reused by radial card orientation. */
function scalpCentroid(hair: StrandHairGeometry): Vec3 {
  if (hair.strands.length === 0) return vec3();
  return scale(
    hair.strands.reduce((acc, s) => add(acc, s.points[0].position), vec3()),
    1 / hair.strands.length,
  );
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scalpAnchors(canonical: CanonicalHuman): Vertex[] {
  const head = canonical.vertices.filter((v) => v.region === 'head' && v.position.y >= 1.85);
  return head.sort((a, b) => a.id - b.id);
}

function makeStrand(
  id: number,
  root: Vertex,
  length: number,
  curl: number,
  segments: number,
): HairStrand {
  const points: HairStrandPoint[] = [];
  const rootPos = root.position;
  const side = Math.sign(rootPos.x) || (id % 2 === 0 ? -1 : 1);
  const back = rootPos.z < 0 ? -1 : 0.35;
  const worldLength = 0.08 + length * 0.42;
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const curlWave = Math.sin(t * Math.PI * 2 + id * 1.618) * curl * 0.045 * t;
    const fall = worldLength * t;
    points.push({
      position: vec3(rootPos.x + side * curlWave, rootPos.y - fall, rootPos.z + back * curlWave),
      radius: 0.004 * (1 - t) + 0.001 * t,
    });
  }
  return { id, rootVertexId: root.id, points };
}

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const f = Math.max(0, Math.min(1, t));
  return [a[0] * (1 - f) + b[0] * f, a[1] * (1 - f) + b[1] * f, a[2] * (1 - f) + b[2] * f];
}
