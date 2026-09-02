import { Vec3 } from '../../core/math/vec';
import { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton';
import { BonePose, quatFromEulerDeg, nlerp } from '../skeleton/skeletal-animation';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface MotionCompilerConfig {
  /** Total IK arm chain length (metres). If 0, auto-measured from skeleton. */
  armChainLength: number;
  /** Total IK leg chain length (metres). If 0, auto-measured from skeleton. */
  legChainLength: number;
  /** Default cross-fade time in seconds for blend transitions. */
  defaultBlendDuration: number;
  /** Maximum look-at angle in degrees before clamping. */
  lookAtMaxAngleDeg: number;
  /** Walk cycle stride length in metres. */
  walkStrideLength: number;
  /** Walk cycle step period in seconds. */
  walkStepPeriod: number;
}

const DEFAULT_CONFIG: MotionCompilerConfig = {
  armChainLength: 0,
  legChainLength: 0,
  defaultBlendDuration: 0.3,
  lookAtMaxAngleDeg: 80,
  walkStrideLength: 0.7,
  walkStepPeriod: 0.55,
};

// ─── Existing exports (kept identical) ───────────────────────────────────────

export type MotionKind =
  'raiseHand' | 'lookAtCamera' | 'neutral' | 'unknown' | 'gesture' | 'walk' | 'transition';

export interface MotionPlan {
  kind: MotionKind;
  confidence: number;
  poses: BonePose[];
  reason?: string;
  /** When present, signals a transition blend: caller should nlerp from previous plan over this many seconds. */
  blendDuration?: number;
}

/** Deterministic behavior compiler from small semantic commands to bone poses. */
export class MotionCompiler {
  private config: MotionCompilerConfig;
  private chainLengths: { arm: number; leg: number } | null = null;

  constructor(config?: Partial<MotionCompilerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compile(command: string, skeleton: BoneDef[]): MotionPlan {
    const text = command.toLowerCase().trim();

    // --- Neutral / rest ---
    if (text.includes('neutral') || text.includes('rest pose') || text.includes('stand still')) {
      return { kind: 'neutral', confidence: 0.95, poses: [] };
    }

    // --- Walk / locomotion ---
    if (text.includes('walk') || text.includes('step forward') || text.includes('locomotion')) {
      const phase = extractNumber(text, 'phase') ?? 0;
      const speed = extractNumber(text, 'speed') ?? 1;
      return compileWalk(skeleton, phase, speed, this.getConfig());
    }

    // --- Gesture commands ---
    const gesture = matchGesture(text);
    if (gesture) {
      return compileGesture(gesture, skeleton, this.getConfig());
    }

    // --- Look-at camera ---
    if (text.includes('look') && (text.includes('camera') || text.includes('forward'))) {
      return compileLookAt(skeleton, { x: 0, y: 0, z: 1 }, this.getConfig());
    }

    // --- Look-at arbitrary target ---
    if (text.includes('look') && text.includes('at')) {
      const target = extractVec3(text);
      if (target) {
        return compileLookAt(skeleton, target, this.getConfig());
      }
    }

    // --- Raise hand (existing) ---
    if (text.includes('raise') && (text.includes('hand') || text.includes('arm'))) {
      const side = text.includes('left') ? 'l' : 'r';
      const sign = side === 'l' ? -1 : 1;
      return {
        kind: 'raiseHand',
        confidence: text.includes('left') || text.includes('right') ? 0.9 : 0.72,
        poses: restPoses(skeleton, [
          [`clavicle_${side}`, -10, 0, sign * 8],
          [`upperarm_${side}`, 0, 0, sign * 118],
          [`forearm_${side}`, 0, 0, sign * 26],
          [`hand_${side}`, 0, 0, sign * 8],
        ]),
      };
    }

    return {
      kind: 'unknown',
      confidence: 0.1,
      poses: [],
      reason: `unrecognized motion command: "${command}"`,
    };
  }

  /** Legacy static entry-point preserved for backwards compatibility. */
  static compile(command: string, skeleton: BoneDef[]): MotionPlan {
    return new MotionCompiler().compile(command, skeleton);
  }

  /** Measure chain lengths from skeleton once and cache them. */
  private getConfig(): MotionCompilerConfig {
    return this.config;
  }
}

// ─── Backward-compatible free function ───────────────────────────────────────

export function compileMotionCommand(command: string, skeleton: BoneDef[]): MotionPlan {
  return MotionCompiler.compile(command, skeleton);
}

// ─── IK Solver ───────────────────────────────────────────────────────────────

export interface IKChain {
  /** Bone names from root to effector (inclusive). */
  bones: string[];
  /** World-space target position for the effector. */
  target: Vec3;
  /** Optional world-space pole-vector target (elbow / knee direction hint). */
  poleVector?: Vec3;
}

/**
 * 2-bone analytical IK solver. Works on a two-segment chain (e.g. upperarm→forearm
 * or thigh→shin). Returns local-space rotation quaternions for each bone in the
 * chain (length 2). Fully deterministic, zero-allocation-friendly.
 */
export function solveIK2Bone(
  chain: IKChain,
  skeleton: BoneDef[],
  config: MotionCompilerConfig,
): BonePose[] {
  if (chain.bones.length < 2) return [];

  const byName = new Map(skeleton.map((b) => [b.name, b]));
  const bone0 = byName.get(chain.bones[0] as BoneName)!;
  const bone1 = byName.get(chain.bones[1] as BoneName)!;
  if (!bone0 || !bone1) return [];

  const L0 = chainLength(bone0, config);
  const L1 = chainLength(bone1, config);
  if (L0 === 0 || L1 === 0) return [];

  // Joint positions in parent-relative local space (T-pose).
  const shoulderPos = bone0.localPosition;
  const totalLen = L0 + L1;

  // --- Solve two-bone IK in the plane defined by shoulder, target, elbow hint ---
  // Distance from shoulder to target.
  const dx = chain.target.x - shoulderPos.x;
  const dy = chain.target.y - shoulderPos.y;
  const dz = chain.target.z - shoulderPos.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const dist = Math.sqrt(distSq);

  // Clamp to reachable range.
  const clamped = Math.min(dist, totalLen - 0.001);
  const clampedSq = clamped * clamped;

  // Law of cosines for elbow angle.
  const cosElbow = (L0 * L0 + L1 * L1 - clampedSq) / (2 * L0 * L1);
  const elbowAngle = Math.acos(clamp(cosElbow, -1, 1));

  // Shoulder angle (angle at the shoulder joint in the triangle).
  const cosShoulder = (L0 * L0 + clampedSq - L1 * L1) / (2 * L0 * clamped);
  const shoulderAngle = Math.acos(clamp(cosShoulder, -1, 1));

  // Angle between the "down" direction (T-pose default: -Y) and the target direction.
  const targetDir = normalize3({ x: dx, y: dy, z: dz });
  const downDir = { x: 0, y: -1, z: 0 };
  const cosDown = clamp(dot3(downDir, targetDir), -1, 1);
  const angleFromDown = Math.acos(cosDown);

  // Determine swing plane: cross product of down and target direction.
  const swingAxis = normalize3(cross3(downDir, targetDir));
  const swingAngle = angleFromDown;
  const tiltAngle = shoulderAngle - Math.PI / 2; // offset from T-pose rest

  // Compose shoulder rotation: swing (toward target) + twist (tilt).
  const shoulderSwing = quatFromAxisAngle(swingAxis, swingAngle);
  const shoulderTwist = quatFromAxisAngle(targetDir, tiltAngle);
  const shoulderRot = multiplyQuat(shoulderSwing, shoulderTwist);

  // Elbow rotation: bend in the plane.
  const elbowRot = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI - elbowAngle);

  return [
    { name: chain.bones[0], localPos: { ...bone0.localPosition }, localRot: shoulderRot },
    { name: chain.bones[1], localPos: { ...bone1.localPosition }, localRot: elbowRot },
  ];
}

// ─── Look-At Solver ──────────────────────────────────────────────────────────

export interface LookAtParams {
  target: Vec3;
  maxAngleDeg?: number;
}

/**
 * Compute head + neck rotations to orient the face toward `target`.
 * Also produces a subtle eye-direction hint via the head bone.
 */
export function solveLookAt(
  skeleton: BoneDef[],
  target: Vec3,
  config: MotionCompilerConfig,
): BonePose[] {
  const byName = new Map(skeleton.map((b) => [b.name, b]));
  const neck = byName.get('neck');
  const head = byName.get('head');
  if (!neck || !head) return [];

  // Chain root is chest → neck → head. We approximate the "eye" position as
  // the world-space tip of the head bone.
  const chest = byName.get('chest');
  const chestWorld = chest ? chest.localPosition : { x: 0, y: 0, z: 0 };
  const neckWorld = add3(chestWorld, neck.localPosition);
  const headWorld = add3(neckWorld, head.localPosition);

  // Direction from eyes to target.
  const dir = normalize3(sub3(target, headWorld));
  // Desired forward is +Z in local space (T-pose). Decompose into yaw + pitch.
  const yaw = Math.atan2(dir.x, dir.z);
  const pitch = Math.atan2(-dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z));

  const maxRad = ((config.lookAtMaxAngleDeg ?? 80) * Math.PI) / 180;
  const clampedYaw = clamp(yaw, -maxRad, maxRad);
  const clampedPitch = clamp(pitch, -maxRad * 0.6, maxRad * 0.6);

  // Split 60 % to neck, 40 % to head for a natural look.
  const neckYaw = clampedYaw * 0.6;
  const neckPitch = clampedPitch * 0.6;
  const headYaw = clampedYaw * 0.4;
  const headPitch = clampedPitch * 0.4;

  return [
    {
      name: 'neck',
      localPos: { ...neck.localPosition },
      localRot: quatFromEulerDeg(-toDeg(neckPitch), toDeg(neckYaw), 0),
    },
    {
      name: 'head',
      localPos: { ...head.localPosition },
      localRot: quatFromEulerDeg(-toDeg(headPitch), toDeg(headYaw), 0),
    },
  ];
}

// ─── Gesture Library ─────────────────────────────────────────────────────────

export type GestureName =
  'wave' | 'point' | 'thumbsUp' | 'crossArms' | 'hipHands' | 'shrug' | 'headNod' | 'headShake';

const GESTURE_PATTERNS: Array<[string[], GestureName]> = [
  [['wave'], 'wave'],
  [['point'], 'point'],
  [['thumb', 'up'], 'thumbsUp'],
  [['cross', 'arm'], 'crossArms'],
  [['hip', 'hand'], 'hipHands'],
  [['shrug'], 'shrug'],
  [['nod', 'head'], 'headNod'],
  [['nod'], 'headNod'],
  [['shake', 'head'], 'headShake'],
  [['shake'], 'headShake'],
];

function matchGesture(text: string): GestureName | null {
  for (const [keywords, name] of GESTURE_PATTERNS) {
    if (keywords.every((kw) => text.includes(kw))) return name;
  }
  return null;
}

function compileGesture(
  gesture: GestureName,
  skeleton: BoneDef[],
  _config: MotionCompilerConfig,
): MotionPlan {
  const poses = gesturePoses(gesture, skeleton);
  return { kind: 'gesture', confidence: 0.88, poses, reason: `gesture: ${gesture}` };
}

function gesturePoses(gesture: GestureName, skeleton: BoneDef[]): BonePose[] {
  switch (gesture) {
    case 'wave':
      return restPoses(skeleton, [
        ['clavicle_r', -10, 0, 8],
        ['upperarm_r', 0, -20, 130],
        ['forearm_r', 0, -40, 30],
        ['hand_r', 0, 0, 20],
      ]);

    case 'point':
      return restPoses(skeleton, [
        ['clavicle_r', -5, 0, 6],
        ['upperarm_r', 10, -30, 90],
        ['forearm_r', 0, 0, 10],
        ['hand_r', 0, 0, 0],
      ]);

    case 'thumbsUp':
      return restPoses(skeleton, [
        ['clavicle_r', -8, 0, 6],
        ['upperarm_r', -20, 0, 80],
        ['forearm_r', 0, 0, 80],
        ['hand_r', 0, 30, 0],
      ]);

    case 'crossArms':
      return [
        ...restPoses(skeleton, [
          ['clavicle_l', -5, 0, -6],
          ['upperarm_l', 20, 40, -60],
          ['forearm_l', 0, 60, 0],
          ['hand_l', 0, 20, 0],
        ]),
        ...restPoses(skeleton, [
          ['clavicle_r', -5, 0, 6],
          ['upperarm_r', 20, -40, 60],
          ['forearm_r', 0, -60, 0],
          ['hand_r', 0, -20, 0],
        ]),
      ];

    case 'hipHands':
      return [
        ...restPoses(skeleton, [
          ['clavicle_l', 0, 0, -4],
          ['upperarm_l', -10, 0, -30],
          ['forearm_l', -60, 0, 0],
          ['hand_l', 0, 0, 0],
        ]),
        ...restPoses(skeleton, [
          ['clavicle_r', 0, 0, 4],
          ['upperarm_r', -10, 0, 30],
          ['forearm_r', -60, 0, 0],
          ['hand_r', 0, 0, 0],
        ]),
      ];

    case 'shrug':
      return restPoses(skeleton, [
        ['clavicle_l', -8, 0, -4],
        ['clavicle_r', -8, 0, 4],
        ['neck', -3, 0, 0],
        ['head', -2, 0, 0],
      ]);

    case 'headNod':
      return restPoses(skeleton, [
        ['neck', -5, 0, 0],
        ['head', -12, 0, 0],
      ]);

    case 'headShake':
      return restPoses(skeleton, [
        ['neck', 0, -10, 0],
        ['head', 0, -14, 0],
      ]);
  }
}

// ─── Retargeting ─────────────────────────────────────────────────────────────

export interface RetargetMapping {
  /** Source skeleton that produced the motion. */
  sourceSkeleton: BoneDef[];
  /** Target skeleton to retarget onto. */
  targetSkeleton: BoneDef[];
}

/**
 * Retarget a list of BonePoses from a source skeleton proportion to a target
 * skeleton. Scales local positions by the ratio of segment lengths and
 * preserves rotations.
 */
export function retargetPoses(poses: BonePose[], mapping: RetargetMapping): BonePose[] {
  const srcByName = new Map(mapping.sourceSkeleton.map((b) => [b.name, b]));
  const tgtByName = new Map(mapping.targetSkeleton.map((b) => [b.name, b]));

  return poses.map((pose) => {
    const srcBone = srcByName.get(pose.name as BoneName);
    const tgtBone = tgtByName.get(pose.name as BoneName);
    if (!srcBone || !tgtBone) return pose;

    const srcLen = vecLength(srcBone.localPosition);
    const tgtLen = vecLength(tgtBone.localPosition);
    const scale = srcLen > 0.0001 ? tgtLen / srcLen : 1;

    return {
      name: pose.name,
      localPos: {
        x: tgtBone.localPosition.x + (pose.localPos.x - srcBone.localPosition.x) * scale,
        y: tgtBone.localPosition.y + (pose.localPos.y - srcBone.localPosition.y) * scale,
        z: tgtBone.localPosition.z + (pose.localPos.z - srcBone.localPosition.z) * scale,
      },
      localRot: pose.localRot,
    };
  });
}

// ─── Walk / Locomotion ───────────────────────────────────────────────────────

/**
 * Procedural walk cycle. `phase` is 0…1 through one full stride (0 = contact,
 * 0.5 = mid-stance). `speed` scales the cycle time.
 * Returns a full-body pose set for the given phase.
 */
export function compileWalk(
  skeleton: BoneDef[],
  phase: number,
  speed: number,
  _config: MotionCompilerConfig,
): MotionPlan {
  const p = ((phase % 1) + 1) % 1; // normalise to [0,1)
  const cycle = p * Math.PI * 2; // one full cycle in radians

  // Swing / stance offsets.
  const hipSwing = Math.sin(cycle) * 25 * speed; // degrees
  const kneeBend = Math.max(0, Math.sin(cycle)) * 40; // degrees
  const armSwing = -hipSwing * 0.7; // contra-lateral

  // Pelvis bob.
  const pelvisBob = Math.abs(Math.sin(cycle)) * 0.02;

  const poses: BonePose[] = [];

  // Pelvis vertical bob.
  const pelvis = skeleton.find((b) => b.name === 'pelvis');
  if (pelvis) {
    poses.push({
      name: 'pelvis',
      localPos: {
        x: pelvis.localPosition.x,
        y: pelvis.localPosition.y + pelvisBob,
        z: pelvis.localPosition.z,
      },
      localRot: quatFromEulerDeg(0, hipSwing * 0.15, 0),
    });
  }

  // Left leg.
  poses.push(
    ...restPoses(skeleton, [
      ['thigh_l', hipSwing, 0, 0],
      ['shin_l', kneeBend, 0, 0],
      ['foot_l', -kneeBend * 0.5, 0, 0],
    ]),
  );

  // Right leg (opposite phase).
  poses.push(
    ...restPoses(skeleton, [
      ['thigh_r', -hipSwing, 0, 0],
      ['shin_r', Math.max(0, -Math.sin(cycle)) * 40, 0, 0],
      ['foot_r', -Math.max(0, -Math.sin(cycle)) * 20, 0, 0],
    ]),
  );

  // Left arm swing.
  poses.push(
    ...restPoses(skeleton, [
      ['upperarm_l', armSwing * 0.4, 0, 0],
      ['forearm_l', Math.max(0, armSwing) * 0.3, 0, 0],
    ]),
  );

  // Right arm swing.
  poses.push(
    ...restPoses(skeleton, [
      ['upperarm_r', -armSwing * 0.4, 0, 0],
      ['forearm_r', Math.max(0, -armSwing) * 0.3, 0, 0],
    ]),
  );

  // Subtle spine counter-rotation.
  poses.push(
    ...restPoses(skeleton, [
      ['spine_01', 0, hipSwing * 0.1, 0],
      ['spine_02', 0, hipSwing * 0.05, 0],
    ]),
  );

  return {
    kind: 'walk',
    confidence: 0.82,
    poses,
    reason: `procedural walk phase=${p.toFixed(2)} speed=${speed.toFixed(2)}`,
  };
}

// ─── Blend / Transition ──────────────────────────────────────────────────────

/**
 * Blend two MotionPlans together. Returns a new plan whose poses are
 * element-wise nlerp of `from` and `to` at blend weight `t` (0…1).
 */
export function blendMotions(from: MotionPlan, to: MotionPlan, t: number): MotionPlan {
  const wt = clamp(t, 0, 1);
  const poseMap = new Map<string, BonePose>();

  for (const p of from.poses) poseMap.set(p.name, p);
  for (const p of to.poses) {
    const existing = poseMap.get(p.name);
    if (existing) {
      poseMap.set(p.name, {
        name: p.name,
        localPos: lerpVec3(existing.localPos, p.localPos, wt),
        localRot: nlerp(existing.localRot, p.localRot, wt),
      });
    } else {
      poseMap.set(p.name, p);
    }
  }

  // Include any remaining from-poses not in to.
  for (const p of from.poses) {
    if (!poseMap.has(p.name)) poseMap.set(p.name, p);
  }

  return {
    kind: to.kind,
    confidence: from.confidence * (1 - wt) + to.confidence * wt,
    poses: Array.from(poseMap.values()),
    blendDuration: to.blendDuration,
    reason: `blend from=${from.kind} to=${to.kind} t=${wt.toFixed(2)}`,
  };
}

/**
 * Create a transition plan: the output `to` plan with a recommended
 * `blendDuration` for smooth cross-fading.
 */
export function transitionTo(
  to: MotionPlan,
  duration?: number,
  config?: Partial<MotionCompilerConfig>,
): MotionPlan {
  return {
    ...to,
    kind: 'transition',
    blendDuration: duration ?? config?.defaultBlendDuration ?? DEFAULT_CONFIG.defaultBlendDuration,
  };
}

// ─── Motion Validation ───────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

/**
 * Validate that every bone pose in a plan is within that bone's joint limits.
 * Bones without limits are considered unconstrained.
 */
export function validateMotion(plan: MotionPlan, skeleton: BoneDef[]): ValidationResult {
  const byName = new Map(skeleton.map((b) => [b.name, b]));
  const violations: string[] = [];

  for (const pose of plan.poses) {
    const bone = byName.get(pose.name as BoneName);
    if (!bone || !bone.limits) continue;

    // Convert quat back to approximate euler for limit checking.
    const euler = quatToEulerDeg(pose.localRot);
    const { minDeg, maxDeg } = bone.limits;

    const axes: Array<[number, number, number, string]> = [
      [euler.x, minDeg.x, maxDeg.x, 'X'],
      [euler.y, minDeg.y, maxDeg.y, 'Y'],
      [euler.z, minDeg.z, maxDeg.z, 'Z'],
    ];

    for (const [val, min, max, axis] of axes) {
      if (val < min || val > max) {
        violations.push(`${pose.name} ${axis}: ${val.toFixed(1)}° outside [${min}, ${max}]`);
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

// ─── Internal helpers (all pure, deterministic) ──────────────────────────────

// --- Minimal Vec3 / Quat math (zero-dependency) ---

function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
function normalize3(v: Vec3): Vec3 {
  const len = vecLength(v);
  return len < 1e-10 ? { x: 0, y: 0, z: 0 } : scale3(v, 1 / len);
}
function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  const k = 1 - t;
  return { x: a.x * k + b.x * t, y: a.y * k + b.y * t, z: a.z * k + b.z * t };
}

// Quat helpers (local, not exported to avoid collisions).
interface Q {
  x: number;
  y: number;
  z: number;
  w: number;
}

function multiplyQuat(a: Q, b: Q): Q {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quatFromAxisAngle(axis: Vec3, angleRad: number): Q {
  const half = angleRad * 0.5;
  const s = Math.sin(half);
  const len = vecLength(axis);
  if (len < 1e-10) return { x: 0, y: 0, z: 0, w: 1 };
  const n = scale3(axis, 1 / len);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) };
}

function quatToEulerDeg(q: Q): { x: number; y: number; z: number } {
  // Roll (x)
  const sinr = 2 * (q.w * q.x + q.y * q.z);
  const cosr = 1 - 2 * (q.x * q.x + q.y * q.y);
  const roll = Math.atan2(sinr, cosr);

  // Pitch (y)
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  // Yaw (z)
  const siny = 2 * (q.w * q.z + q.x * q.y);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yaw = Math.atan2(siny, cosy);

  return { x: toDeg(roll), y: toDeg(pitch), z: toDeg(yaw) };
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function chainLength(bone: BoneDef, _config: MotionCompilerConfig): number {
  return vecLength(bone.localPosition);
}

// ─── Internal: rest-pose helper (existing, unchanged logic) ──────────────────

function restPoses(
  skeleton: BoneDef[],
  rotations: Array<[string, number, number, number]>,
): BonePose[] {
  const byName = new Map(skeleton.map((b) => [b.name, b]));
  return rotations.flatMap(([name, x, y, z]) => {
    const bone = byName.get(name as BoneName);
    if (!bone) return [];
    return [{ name, localPos: { ...bone.localPosition }, localRot: quatFromEulerDeg(x, y, z) }];
  });
}

// ─── Internal: command parsing helpers ───────────────────────────────────────

function extractNumber(text: string, key: string): number | null {
  const re = new RegExp(`${key}\\s*[=:]?\\s*(-?\\d+\\.?\\d*)`, 'i');
  const m = text.match(re);
  return m ? parseFloat(m[1]) : null;
}

function extractVec3(text: string): Vec3 | null {
  // Try to find "at x,y,z" or "at (x, y, z)" patterns.
  const re = /at\s*\(?(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\)?/;
  const m = text.match(re);
  if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) };
  return null;
}

// ─── Public: look-at entry point ─────────────────────────────────────────────

/** High-level look-at that produces a MotionPlan. */
export function compileLookAt(
  skeleton: BoneDef[],
  target: Vec3,
  config?: Partial<MotionCompilerConfig>,
): MotionPlan {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const poses = solveLookAt(skeleton, target, cfg);
  return {
    kind: 'lookAtCamera',
    confidence: 0.88,
    poses,
    reason: `lookAt (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)})`,
  };
}

/** High-level IK entry point that produces a MotionPlan. */
export function compileIKArm(
  skeleton: BoneDef[],
  side: 'l' | 'r',
  target: Vec3,
  poleVector?: Vec3,
  config?: Partial<MotionCompilerConfig>,
): MotionPlan {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const chain: IKChain = {
    bones: [`upperarm_${side}`, `forearm_${side}`],
    target,
    poleVector,
  };
  const poses = solveIK2Bone(chain, skeleton, cfg);
  return { kind: 'raiseHand', confidence: 0.92, poses, reason: `IK arm ${side}` };
}

/** High-level IK entry point for legs. */
export function compileIKLeg(
  skeleton: BoneDef[],
  side: 'l' | 'r',
  target: Vec3,
  poleVector?: Vec3,
  config?: Partial<MotionCompilerConfig>,
): MotionPlan {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const chain: IKChain = {
    bones: [`thigh_${side}`, `shin_${side}`],
    target,
    poleVector,
  };
  const poses = solveIK2Bone(chain, skeleton, cfg);
  return { kind: 'neutral', confidence: 0.92, poses, reason: `IK leg ${side}` };
}
