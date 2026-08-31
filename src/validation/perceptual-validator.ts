import { AnatomyConstraint, AnatomyDimensions, validateAnatomy } from "../anatomy/parametric/parametric-anatomy";
import { CharacterEvent, createEvent } from "../core/events/character-event";
import { HumanDefinition } from "../core/schema/human-definition";
import { CanonicalHuman } from "../geometry/canonical/canonical-human";

export type PerceptualIssueKind =
  | "anatomy.proportion"
  | "eye.alignment"
  | "mouth.intersection"
  | "expression.range";

export interface PerceptualIssue {
  kind: PerceptualIssueKind;
  severity: "info" | "warning" | "error";
  message: string;
  score: number;
  correctiveRequest?: CharacterEvent;
}

export interface PerceptualValidationReport {
  score: number;
  issues: PerceptualIssue[];
  correctiveRequests: CharacterEvent[];
}

/**
 * Optional visual/perceptual validation prototype. It never mutates geometry;
 * it only emits structured corrective requests for the normal event pipeline.
 */
export function validatePerceptualHuman(
  definition: HumanDefinition,
  canonical: CanonicalHuman,
  dims: AnatomyDimensions
): PerceptualValidationReport {
  const issues: PerceptualIssue[] = [];
  for (const c of validateAnatomy(dims)) addAnatomyIssue(issues, c);
  addEyeIssue(issues, definition, canonical);
  addMouthIssue(issues, definition);
  addExpressionIssue(issues, definition);

  const score = issues.length === 0
    ? 1
    : issues.reduce((sum, issue) => sum + issue.score, 0) / issues.length;
  return {
    score,
    issues,
    correctiveRequests: issues.flatMap((issue) => issue.correctiveRequest ? [issue.correctiveRequest] : []),
  };
}

function addAnatomyIssue(issues: PerceptualIssue[], c: AnatomyConstraint): void {
  if (c.satisfaction >= 0.85) return;
  const changes: Record<string, number> = {};
  if (c.message.includes("waist")) changes["body.waist"] = 1.0;
  if (c.message.includes("hips")) changes["body.hips"] = 1.0;
  issues.push({
    kind: "anatomy.proportion",
    severity: c.satisfaction < 0.5 ? "error" : "warning",
    message: c.message,
    score: c.satisfaction,
    correctiveRequest: Object.keys(changes).length > 0 ? createEvent("set", "developer", { changes, meta: { perceptual: true } }) : undefined,
  });
}

function addEyeIssue(issues: PerceptualIssue[], definition: HumanDefinition, canonical: CanonicalHuman): void {
  const eyeSpacing = definition.get("face.eyeSpacing");
  const eyeVertices = canonical.vertices.filter((v) => v.region === "eyes");
  const left = eyeVertices.filter((v) => v.position.x < 0);
  const right = eyeVertices.filter((v) => v.position.x > 0);
  if (left.length === 0 || right.length === 0) return;
  const ly = left.reduce((sum, v) => sum + v.position.y, 0) / left.length;
  const ry = right.reduce((sum, v) => sum + v.position.y, 0) / right.length;
  const yError = Math.abs(ly - ry);
  if (eyeSpacing < 0.82 || eyeSpacing > 1.28 || yError > 0.015) {
    issues.push({
      kind: "eye.alignment",
      severity: eyeSpacing < 0.78 || eyeSpacing > 1.32 || yError > 0.03 ? "error" : "warning",
      message: `eye alignment/spacing outside perceptual target (spacing=${eyeSpacing.toFixed(2)}, yError=${yError.toFixed(3)})`,
      score: Math.max(0, 1 - Math.abs(eyeSpacing - 1) * 2 - yError * 12),
      correctiveRequest: createEvent("set", "developer", { changes: { "face.eyeSpacing": 1.0 }, meta: { perceptual: true } }),
    });
  }
}

function addMouthIssue(issues: PerceptualIssue[], definition: HumanDefinition): void {
  const jawOpen = definition.get("expression.jawOpen");
  const tongueOut = definition.get("expression.tongueOut");
  if (tongueOut > 0.7 && jawOpen < 0.2) {
    issues.push({
      kind: "mouth.intersection",
      severity: "warning",
      message: "tongue-out expression likely intersects closed mouth",
      score: 0.55,
      correctiveRequest: createEvent("set", "developer", { changes: { "expression.jawOpen": 0.35 }, meta: { perceptual: true } }),
    });
  }
}

function addExpressionIssue(issues: PerceptualIssue[], definition: HumanDefinition): void {
  const smile = definition.get("expression.mouthSmileLeft") + definition.get("expression.mouthSmileRight");
  const frown = definition.get("expression.mouthFrownLeft") + definition.get("expression.mouthFrownRight");
  if (smile > 1.2 && frown > 1.2) {
    issues.push({
      kind: "expression.range",
      severity: "warning",
      message: "strong smile and frown are active together",
      score: 0.6,
      correctiveRequest: createEvent("set", "developer", {
        changes: { "expression.mouthFrownLeft": 0, "expression.mouthFrownRight": 0 },
        meta: { perceptual: true },
      }),
    });
  }
}
