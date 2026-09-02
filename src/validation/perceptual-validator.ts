import {
  AnatomyConstraint,
  AnatomyDimensions,
  validateAnatomy,
} from '../anatomy/parametric/parametric-anatomy';
import { CharacterEvent, createEvent } from '../core/events/character-event';
import { HumanDefinition } from '../core/schema/human-definition';
import { CanonicalHuman } from '../geometry/canonical/canonical-human';

export type PerceptualIssueKind =
  | 'anatomy.proportion'
  | 'eye.alignment'
  | 'mouth.intersection'
  | 'expression.range'
  | 'skin.tone'
  | 'proportion.ratio'
  | 'symmetry';

export type ValidationSeverity = 'info' | 'warning' | 'error';

export interface PerceptualIssue {
  kind: PerceptualIssueKind;
  severity: ValidationSeverity;
  message: string;
  score: number; // 0..1 (1 = fully satisfied)
  correctiveRequest?: CharacterEvent;
}

export interface PerceptualValidationReport {
  score: number;
  issues: PerceptualIssue[];
  correctiveRequests: CharacterEvent[];
  /** Counts of issues per severity level. */
  severityCounts: Record<ValidationSeverity, number>;
  /** Stable JSON-serializable snapshot of the report. */
  json: PerceptualValidationReportJSON;
}

/** JSON-serializable report shape (no functions / no CharacterEvent refs). */
export interface PerceptualValidationReportJSON {
  score: number;
  issues: Array<{
    kind: PerceptualIssueKind;
    severity: ValidationSeverity;
    message: string;
    score: number;
  }>;
  severityCounts: Record<ValidationSeverity, number>;
}

/** Tuning thresholds for perceptual validation checks. */
export interface PerceptualValidatorConfig {
  /** Minimum satisfaction before an anatomy constraint becomes an issue. */
  anatomySatisfactionThreshold: number;
  /** Eye y-misalignment (in model units) tolerated before flagging. */
  eyeYErrorWarning: number;
  eyeYErrorError: number;
  minEyeSpacing: number;
  maxEyeSpacing: number;
  eyeSpacingErrorMin: number;
  eyeSpacingErrorMax: number;
  /** Skin tone checks. */
  skinLuminanceSpreadMax: number;
  /** Proportion ratio checks. */
  armSpanRatioTolerance: number; // allowed deviation of armSpan/height from neutral
  headHeightRatioMin: number;
  headHeightRatioMax: number;
  /** Symmetry checks. */
  symmetryOffsetTolerance: number;
  /** Cache: whether changed properties invalidate checks. */
  cacheEnabled: boolean;
}

const DEFAULT_CONFIG: PerceptualValidatorConfig = {
  anatomySatisfactionThreshold: 0.85,
  eyeYErrorWarning: 0.015,
  eyeYErrorError: 0.03,
  minEyeSpacing: 0.82,
  maxEyeSpacing: 1.28,
  eyeSpacingErrorMin: 0.78,
  eyeSpacingErrorMax: 1.32,
  skinLuminanceSpreadMax: 0.12,
  armSpanRatioTolerance: 0.15,
  headHeightRatioMin: 0.85,
  headHeightRatioMax: 1.3,
  symmetryOffsetTolerance: 0.02,
  cacheEnabled: true,
};

/**
 * Structure-invariant arm-span-to-height ratio produced by the canonical
 * neutral limb lengths (upper=0.1h, forearm=0.085h, hand=0.05h each side).
 */
export const NEUTRAL_ARM_SPAN_RATIO = 0.47;

/**
 * Optional visual/perceptual validation prototype. It never mutates geometry;
 * it only emits structured corrective requests for the normal event pipeline.
 */

/**
 * Rendered-image evaluation hooks. When a renderer is attached, validation can
 * request and inspect a rendered frame for visual-only checks (tone gradients,
 * silhouette symmetry) that cannot be derived from raw geometry alone.
 */
export interface PerceptualRenderedFrame {
  /** Width in pixels of the rendered frame. */
  width: number;
  /** Height in pixels of the rendered frame. */
  height: number;
  /** Luminance per pixel, row-major. If missing, luminance is computed. */
  luminance?: Float32Array;
  /** Average skin-tone RGB channels per skin pixel cluster (0..1). */
  skinSamples?: Array<{ r: number; g: number; b: number }>;
}

/** Renderer-facing interface that produces frames for visual validation. */
export interface VisualEvaluationHook {
  id: string;
  /** Capture a low-resolution frame for validation purposes. */
  captureFrame: () => PerceptualRenderedFrame | null;
  /** True when a fresh frame is available to evaluate. */
  hasFreshFrame: () => boolean;
}

/**
 * Collects multiple corrective requests and applies them atomically — all-or-
 * nothing — so a character is never left in a half-corrected state.
 */
export class CorrectiveBatch {
  private requests: CharacterEvent[] = [];

  add(event: CharacterEvent): void {
    this.requests.push(event);
  }
  addAll(events: CharacterEvent[]): void {
    for (const e of events) this.requests.push(e);
  }
  get size(): number {
    return this.requests.length;
  }
  isEmpty(): boolean {
    return this.requests.length === 0;
  }
  /** All merged corrective requests (changed-property map deduplicated). */
  toEvents(): CharacterEvent[] {
    return this.requests.slice();
  }
  clear(): void {
    this.requests = [];
  }
  /**
   * Deterministically merge all corrective "set" requests into a single
   * atomic event. Later requests win on property conflicts.
   */
  toAtomicEvent(source: 'developer' = 'developer'): CharacterEvent | null {
    if (this.requests.length === 0) return null;
    const changes: Record<string, number> = {};
    for (const ev of this.requests) {
      if (ev.changes) {
        for (const [path, value] of Object.entries(ev.changes)) {
          changes[path] = value as number;
        }
      } else if (ev.path !== undefined && ev.value !== undefined) {
        changes[ev.path] = ev.value as number;
      }
    }
    if (Object.keys(changes).length === 0) return null;
    return createEvent('set', source, { changes, meta: { perceptual: true, atomic: true } });
  }
}

/**
 * Cache for incremental validation: tracks which properties have changed since
 * the last validation so unchanged properties are not re-validated.
 */
export class ValidationCache {
  private fingerprint: Record<string, number> = {};
  private validKinds = new Set<PerceptualIssueKind>();

  /**
   * Snapshots the current definition values keyed by property path. Returns
   * true if anything changed relative to the last snapshot.
   */
  snapshotChanged(definition: HumanDefinition): boolean {
    const next: Record<string, number> = definition.serialize();
    let changed =
      !this.validKinds.add('__init' as PerceptualIssueKind) || this.validKinds.size === 0;
    let any = false;
    for (const [k, v] of Object.entries(next)) {
      if (this.fingerprint[k] !== v) any = true;
      this.fingerprint[k] = v;
    }
    return changed || any;
  }

  /** Mark a particular check kind as already validated at this snapshot. */
  markValid(kind: PerceptualIssueKind): void {
    this.validKinds.add(kind);
  }
  /** True if this check kind is already valid at the current snapshot. */
  isValid(kind: PerceptualIssueKind): boolean {
    return this.validKinds.has(kind);
  }
  /** Invalidate everything (called when the definition changes). */
  reset(): void {
    this.validKinds.clear();
    this.fingerprint = {};
  }
  /** Deterministic representation for debugging. */
  toJSON(): unknown {
    return { validKinds: [...this.validKinds] };
  }
}

/**
 * Instances a reusable perceptual validator with configurable thresholds,
 * incremental caching, corrective batching, and rendered-frame evaluation.
 */
export class PerceptualValidator {
  readonly cache = new ValidationCache();
  private config: PerceptualValidatorConfig;
  private hooks: VisualEvaluationHook[] = [];

  constructor(config: Partial<PerceptualValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): PerceptualValidatorConfig {
    return { ...this.config };
  }

  /** Attach a rendered-frame evaluation hook. */
  attachVisualHook(hook: VisualEvaluationHook): void {
    if (!this.hooks.some((h) => h.id === hook.id)) this.hooks.push(hook);
  }

  detachVisualHook(id: string): void {
    this.hooks = this.hooks.filter((h) => h.id !== id);
  }

  /** Batch + run a validator function; returns (issues, correctiveBatch). */
  private run(validate: (issues: PerceptualIssue[]) => void): {
    issues: PerceptualIssue[];
    batch: CorrectiveBatch;
  } {
    const issues: PerceptualIssue[] = [];
    validate(issues);
    const batch = new CorrectiveBatch();
    for (const issue of issues) {
      if (issue.correctiveRequest) batch.add(issue.correctiveRequest);
    }
    return { issues, batch };
  }

  /** Aggregate severity threshold rules into a report. */
  validate(
    definition: HumanDefinition,
    canonical: CanonicalHuman,
    dims: AnatomyDimensions,
  ): PerceptualValidationReport {
    const { issues, batch } = this.run((issues) => {
      this.validateAnatomy(issues, dims);
      this.validateEye(issues, definition, canonical);
      this.validateMouth(issues, definition);
      this.validateExpression(issues, definition);
      this.validateSkinTone(issues, definition);
      this.validateProportionRatios(issues, definition, dims);
      this.validateSymmetry(issues, canonical);
      this.validateRender(issues);
    });

    const correctiveRequests = batch.toEvents();
    const score =
      issues.length === 0 ? 1 : issues.reduce((sum, issue) => sum + issue.score, 0) / issues.length;
    const severityCounts = countSeverities(issues);

    return {
      score,
      issues,
      correctiveRequests,
      severityCounts,
      json: toJSON(score, issues, severityCounts),
    };
  }

  private anatomyOk(c: AnatomyConstraint): boolean {
    return c.satisfaction >= this.config.anatomySatisfactionThreshold;
  }

  private validateAnatomy(issues: PerceptualIssue[], dims: AnatomyDimensions): void {
    if (this.cache.isValid('anatomy.proportion')) return;
    for (const c of validateAnatomy(dims)) {
      if (this.anatomyOk(c)) continue;
      const changes: Record<string, number> = {};
      if (c.message.includes('waist')) changes['body.waist'] = 1.0;
      if (c.message.includes('hips')) changes['body.hips'] = 1.0;
      issues.push({
        kind: 'anatomy.proportion',
        severity: c.satisfaction < 0.5 ? 'error' : 'warning',
        message: c.message,
        score: c.satisfaction,
        correctiveRequest:
          Object.keys(changes).length > 0
            ? createEvent('set', 'developer', { changes, meta: { perceptual: true } })
            : undefined,
      });
    }
    this.cache.markValid('anatomy.proportion');
  }

  private validateEye(
    issues: PerceptualIssue[],
    definition: HumanDefinition,
    canonical: CanonicalHuman,
  ): void {
    if (this.cache.isValid('eye.alignment')) return;
    const eyeSpacing = definition.get('face.eyeSpacing');
    const eyeVertices = canonical.vertices.filter((v) => v.region === 'eyes');
    const left = eyeVertices.filter((v) => v.position.x < 0);
    const right = eyeVertices.filter((v) => v.position.x > 0);
    if (left.length === 0 || right.length === 0) {
      this.cache.markValid('eye.alignment');
      return;
    }
    const ly = left.reduce((sum, v) => sum + v.position.y, 0) / left.length;
    const ry = right.reduce((sum, v) => sum + v.position.y, 0) / right.length;
    const yError = Math.abs(ly - ry);
    if (
      eyeSpacing < this.config.minEyeSpacing ||
      eyeSpacing > this.config.maxEyeSpacing ||
      yError > this.config.eyeYErrorWarning
    ) {
      issues.push({
        kind: 'eye.alignment',
        severity:
          eyeSpacing < this.config.eyeSpacingErrorMin ||
          eyeSpacing > this.config.eyeSpacingErrorMax ||
          yError > this.config.eyeYErrorError
            ? 'error'
            : 'warning',
        message: `eye alignment/spacing outside perceptual target (spacing=${eyeSpacing.toFixed(2)}, yError=${yError.toFixed(3)})`,
        score: Math.max(0, 1 - Math.abs(eyeSpacing - 1) * 2 - yError * 12),
        correctiveRequest: createEvent('set', 'developer', {
          changes: { 'face.eyeSpacing': 1.0 },
          meta: { perceptual: true },
        }),
      });
    }
    this.cache.markValid('eye.alignment');
  }

  private validateMouth(issues: PerceptualIssue[], definition: HumanDefinition): void {
    if (this.cache.isValid('mouth.intersection')) return;
    const jawOpen = definition.get('expression.jawOpen');
    const tongueOut = definition.get('expression.tongueOut');
    if (tongueOut > 0.7 && jawOpen < 0.2) {
      issues.push({
        kind: 'mouth.intersection',
        severity: 'warning',
        message: 'tongue-out expression likely intersects closed mouth',
        score: 0.55,
        correctiveRequest: createEvent('set', 'developer', {
          changes: { 'expression.jawOpen': 0.35 },
          meta: { perceptual: true },
        }),
      });
    }
    this.cache.markValid('mouth.intersection');
  }

  private validateExpression(issues: PerceptualIssue[], definition: HumanDefinition): void {
    if (this.cache.isValid('expression.range')) return;
    const smile =
      definition.get('expression.mouthSmileLeft') + definition.get('expression.mouthSmileRight');
    const frown =
      definition.get('expression.mouthFrownLeft') + definition.get('expression.mouthFrownRight');
    if (smile > 1.2 && frown > 1.2) {
      issues.push({
        kind: 'expression.range',
        severity: 'warning',
        message: 'strong smile and frown are active together',
        score: 0.6,
        correctiveRequest: createEvent('set', 'developer', {
          changes: { 'expression.mouthFrownLeft': 0, 'expression.mouthFrownRight': 0 },
          meta: { perceptual: true },
        }),
      });
    }
    this.cache.markValid('expression.range');
  }

  private validateSkinTone(issues: PerceptualIssue[], definition: HumanDefinition): void {
    if (this.cache.isValid('skin.tone')) return;
    const r = definition.get('skin.baseColorR');
    const g = definition.get('skin.baseColorG');
    const b = definition.get('skin.baseColorB');
    const pigmentation = definition.get('skin.pigmentation');
    if ([r, g, b, pigmentation].every((v) => Number.isFinite(v))) {
      // Skin tone should read as a plausible fleshtone: red dominates green,
      // green dominates blue, and channels spread within a perceptual range.
      const spread = Math.abs(r - b);
      const rDominatesG = r >= g - 0.02;
      const gDominatesB = g > b;
      const plausible =
        rDominatesG && gDominatesB && spread <= this.config.skinLuminanceSpreadMax * 2;
      if (!plausible) {
        const severity: ValidationSeverity =
          spread > this.config.skinLuminanceSpreadMax * 3 ? 'warning' : 'info';
        issues.push({
          kind: 'skin.tone',
          severity,
          message: `skin tone channels diverge beyond perceptual target (r=${r.toFixed(2)}, g=${g.toFixed(2)}, b=${b.toFixed(2)})`,
          score: Math.max(0, 1 - Math.max(0, r - b) / 0.5),
          correctiveRequest: createEvent('set', 'developer', {
            changes: { 'skin.pigmentation': pigmentation },
            meta: { perceptual: true },
          }),
        });
      }
    }
    this.cache.markValid('skin.tone');
  }

  private validateProportionRatios(
    issues: PerceptualIssue[],
    definition: HumanDefinition,
    dims: AnatomyDimensions,
  ): void {
    if (this.cache.isValid('proportion.ratio')) return;

    // Structural reference: for this canonical model the neutral limb lengths
    // yield a fixed arm-span-to-height ratio when all limb factors are 1.0.
    // Validate against that neutral reference so the default human is clean
    // but distorted limb lengths are flagged.
    const height = dims.height;
    if (height > 0) {
      const armSpan = dims.upperarmLength * 2 + dims.forearmLength * 2 + dims.handLength * 2;
      const ratio = armSpan / height;
      const err = Math.abs(ratio - NEUTRAL_ARM_SPAN_RATIO);
      if (err > this.config.armSpanRatioTolerance) {
        const severity: ValidationSeverity =
          err > this.config.armSpanRatioTolerance * 2 ? 'warning' : 'info';
        issues.push({
          kind: 'proportion.ratio',
          severity,
          message: `arm span / height ratio ${ratio.toFixed(2)} deviates from neutral ${NEUTRAL_ARM_SPAN_RATIO.toFixed(2)} beyond tolerance`,
          score: Math.max(0, 1 - err / 0.5),
          correctiveRequest: createEvent('set', 'developer', {
            changes: { 'skeleton.armLength': 1.0 },
            meta: { perceptual: true },
          }),
        });
      }
    }

    // Head vs body: `identity.headProportion` is a scale factor around 1.0
    // (neutral head). Flag if it leaves the plausible human band.
    const headScale = definition.get('identity.headProportion');
    if (Number.isFinite(headScale)) {
      if (
        headScale < this.config.headHeightRatioMin ||
        headScale > this.config.headHeightRatioMax
      ) {
        const severity: ValidationSeverity =
          headScale < this.config.headHeightRatioMin * 0.9 ||
          headScale > this.config.headHeightRatioMax * 1.1
            ? 'warning'
            : 'info';
        issues.push({
          kind: 'proportion.ratio',
          severity,
          message: `head / body proportion ${headScale.toFixed(2)} outside plausible human range`,
          score: Math.max(0, 1 - Math.abs(headScale - 1) * 4),
          correctiveRequest: createEvent('set', 'developer', {
            changes: { 'identity.headProportion': 1.0 },
            meta: { perceptual: true },
          }),
        });
      }
    }
    this.cache.markValid('proportion.ratio');
  }

  private validateSymmetry(issues: PerceptualIssue[], canonical: CanonicalHuman): void {
    if (this.cache.isValid('symmetry')) return;
    const pairs: Array<[string, string]> = [
      ['upperarm_l', 'upperarm_r'],
      ['forearm_l', 'forearm_r'],
      ['hand_l', 'hand_r'],
      ['thigh_l', 'thigh_r'],
      ['shin_l', 'shin_r'],
    ];
    for (const [l, r] of pairs) {
      const lv = canonical.vertices.filter((v) => v.region === l);
      const rv = canonical.vertices.filter((v) => v.region === r);
      if (lv.length === 0 || rv.length === 0) continue;
      const lCount = lv.length;
      const rCount = rv.length;
      const diff = Math.abs(lCount - rCount);
      if (diff > 0) {
        const offset = diff / Math.max(lCount, rCount);
        if (offset > this.config.symmetryOffsetTolerance) {
          issues.push({
            kind: 'symmetry',
            severity: offset > this.config.symmetryOffsetTolerance * 1.8 ? 'warning' : 'info',
            message: `left/right ${l} vertex count asymmetry (${lCount} vs ${rCount})`,
            score: Math.max(0, 1 - offset / 0.5),
          });
        }
      }
    }
    // Mirror the pose-space check across the sagittal plane.
    const faceL = canonical.vertices.filter((v) => v.region === 'face' && v.position.x < 0);
    const faceR = canonical.vertices.filter((v) => v.region === 'face' && v.position.x > 0);
    if (faceL.length > 0 && faceR.length > 0) {
      const spreadL = vertexSpread(faceL);
      const spreadR = vertexSpread(faceR);
      if (Math.abs(spreadL - spreadR) > this.config.symmetryOffsetTolerance * 4) {
        issues.push({
          kind: 'symmetry',
          severity: 'info',
          message: 'face asymmetry across sagittal plane',
          score: 0.8,
        });
      }
    }
    this.cache.markValid('symmetry');
  }

  private validateRender(issues: PerceptualIssue[]): void {
    for (const hook of this.hooks) {
      if (!hook.hasFreshFrame()) continue;
      const frame = hook.captureFrame();
      if (!frame) continue;
      if (frame.skinSamples && frame.skinSamples.length > 1) {
        const min = Math.min(...frame.skinSamples.map((s) => (s.r + s.g + s.b) / 3));
        const max = Math.max(...frame.skinSamples.map((s) => (s.r + s.g + s.b) / 3));
        const spread = max - min;
        if (spread > this.config.skinLuminanceSpreadMax) {
          issues.push({
            kind: 'skin.tone',
            severity: 'info',
            message: `rendered skin tone gradient exceeds perceptual target (${spread.toFixed(3)})`,
            score: Math.max(0, 1 - spread / 0.4),
          });
        }
      }
    }
  }

  /** Export the current report as a portable JSON object. */
  exportJSON(
    definition: HumanDefinition,
    canonical: CanonicalHuman,
    dims: AnatomyDimensions,
  ): PerceptualValidationReportJSON {
    return this.validate(definition, canonical, dims).json;
  }
}

function vertexSpread(verts: Array<{ position: { x: number; y: number; z: number } }>): number {
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  for (const v of verts) {
    if (v.position.x < minX) minX = v.position.x;
    if (v.position.x > maxX) maxX = v.position.x;
    if (v.position.y < minY) minY = v.position.y;
    if (v.position.y > maxY) maxY = v.position.y;
    if (v.position.z < minZ) minZ = v.position.z;
    if (v.position.z > maxZ) maxZ = v.position.z;
  }
  return maxX - minX + (maxY - minY) + (maxZ - minZ);
}

function countSeverities(issues: PerceptualIssue[]): Record<ValidationSeverity, number> {
  let info = 0,
    warning = 0,
    error = 0;
  for (const i of issues) {
    if (i.severity === 'info') info += 1;
    else if (i.severity === 'warning') warning += 1;
    else error += 1;
  }
  return { info, warning, error };
}

function toJSON(
  score: number,
  issues: PerceptualIssue[],
  severityCounts: Record<ValidationSeverity, number>,
): PerceptualValidationReportJSON {
  return {
    score,
    issues: issues.map((i) => ({
      kind: i.kind,
      severity: i.severity,
      message: i.message,
      score: i.score,
    })),
    severityCounts,
  };
}

/**
 * Functional entry point kept for backward compatibility. Uses a fresh config
 * and cache each call so it remains deterministic and side-effect free.
 */
export function validatePerceptualHuman(
  definition: HumanDefinition,
  canonical: CanonicalHuman,
  dims: AnatomyDimensions,
): PerceptualValidationReport {
  return new PerceptualValidator().validate(definition, canonical, dims);
}
