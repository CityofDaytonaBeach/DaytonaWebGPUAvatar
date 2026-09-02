import { describe, it, expect } from 'vitest';
import {
  validateMotion,
  solveIK2Bone,
  solveLookAt,
  compileMotionCommand,
  MotionPlan,
} from './motion-compiler.js';
import { BoneDef, IDENTITY_QUAT } from '../../core/math/vec.js';
import { quatFromEulerDeg } from '../../animation/skeleton/skeletal-animation.js';

const CONFIG = {
  armChainLength: 0,
  legChainLength: 0,
  defaultBlendDuration: 0.3,
  lookAtMaxAngleDeg: 80,
  walkStrideLength: 0.7,
  walkStepPeriod: 0.55,
};

function armSkeleton(): BoneDef[] {
  return [
    {
      name: 'root',
      parent: null,
      localPosition: { x: 0, y: 0, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'upperarm_l',
      parent: 'root',
      localPosition: { x: 0, y: 0.3, z: 0 },
      restRotation: IDENTITY_QUAT,
      limits: { minDeg: { x: -180, y: -45, z: -180 }, maxDeg: { x: 180, y: 45, z: 180 } },
    },
    {
      name: 'forearm_l',
      parent: 'upperarm_l',
      localPosition: { x: 0, y: 0.3, z: 0 },
      restRotation: IDENTITY_QUAT,
      limits: { minDeg: { x: -180, y: -45, z: -180 }, maxDeg: { x: 180, y: 45, z: 180 } },
    },
  ];
}

describe('validateMotion', () => {
  it('reports valid for a neutral plan', () => {
    const plan: MotionPlan = { kind: 'neutral', confidence: 1, poses: [] };
    expect(validateMotion(plan, armSkeleton())).toEqual({ valid: true, violations: [] });
  });

  it('flags poses outside joint limits', () => {
    const skeleton: BoneDef[] = armSkeleton().concat([
      {
        name: 'neck',
        parent: 'root',
        localPosition: { x: 0, y: 1.1, z: 0 },
        restRotation: IDENTITY_QUAT,
        // Very tight bounds: any non-zero rotation is a violation.
        limits: { minDeg: { x: -0.5, y: -0.5, z: -0.5 }, maxDeg: { x: 0.5, y: 0.5, z: 0.5 } },
      },
    ]);
    const plan: MotionPlan = {
      kind: 'gesture',
      confidence: 1,
      poses: [
        {
          name: 'neck',
          localPos: { x: 0, y: 1.1, z: 0 },
          localRot: quatFromEulerDeg(20, 0, 0),
        },
      ],
    };
    const result = validateMotion(plan, skeleton);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('neck');
  });

  it('ignores bones without limits and bones not in the skeleton', () => {
    const plan: MotionPlan = {
      kind: 'gesture',
      confidence: 1,
      poses: [
        { name: 'root', localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(90, 90, 90) },
        {
          name: 'missing_bone',
          localPos: { x: 0, y: 0, z: 0 },
          localRot: quatFromEulerDeg(90, 90, 90),
        },
      ],
    };
    expect(validateMotion(plan, armSkeleton()).valid).toBe(true);
  });
});

describe('solveIK2Bone', () => {
  it('returns one pose per chain bone in order', () => {
    const poses = solveIK2Bone(
      { bones: ['upperarm_l', 'forearm_l'], target: { x: 0, y: 0.6, z: 0 } },
      armSkeleton(),
      CONFIG,
    );
    expect(poses.map((p) => p.name)).toEqual(['upperarm_l', 'forearm_l']);
  });

  it('returns empty for a chain shorter than two bones', () => {
    expect(
      solveIK2Bone(
        { bones: ['upperarm_l'], target: { x: 0, y: 0.6, z: 0 } },
        armSkeleton(),
        CONFIG,
      ),
    ).toEqual([]);
  });

  it('is deterministic for identical inputs', () => {
    const a = solveIK2Bone(
      { bones: ['upperarm_l', 'forearm_l'], target: { x: 0.2, y: 0.5, z: 0.1 } },
      armSkeleton(),
      CONFIG,
    );
    const b = solveIK2Bone(
      { bones: ['upperarm_l', 'forearm_l'], target: { x: 0.2, y: 0.5, z: 0.1 } },
      armSkeleton(),
      CONFIG,
    );
    expect(a).toEqual(b);
  });
});

describe('solveLookAt', () => {
  it('returns empty when neck/head are missing', () => {
    const skeleton: BoneDef[] = [
      {
        name: 'root',
        parent: null,
        localPosition: { x: 0, y: 0, z: 0 },
        restRotation: IDENTITY_QUAT,
      },
    ];
    expect(solveLookAt(skeleton, { x: 1, y: 1, z: 0 }, CONFIG)).toEqual([]);
  });

  it('returns poses (possibly empty) referencing only known bones', () => {
    const skeleton: BoneDef[] = armSkeleton().concat([
      {
        name: 'neck',
        parent: 'root',
        localPosition: { x: 0, y: 1.2, z: 0 },
        restRotation: IDENTITY_QUAT,
      },
      {
        name: 'head',
        parent: 'neck',
        localPosition: { x: 0, y: 0.2, z: 0 },
        restRotation: IDENTITY_QUAT,
      },
    ]);
    const poses = solveLookAt(skeleton, { x: 0.5, y: 1, z: -0.5 }, CONFIG);
    const names = new Set(skeleton.map((b) => b.name));
    for (const p of poses) expect(names.has(p.name)).toBe(true);
  });
});

describe('compileMotionCommand', () => {
  it('maps neutral commands to a neutral plan with no poses', () => {
    const plan = compileMotionCommand('stand still', armSkeleton());
    expect(plan.kind).toBe('neutral');
    expect(plan.poses).toEqual([]);
  });
});
