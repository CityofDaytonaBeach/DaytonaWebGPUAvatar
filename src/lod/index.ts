import { KernelKind } from "../compiler/delta/delta-compiler";
import { PropertyCategory } from "../core/schema/property";

export type SubsystemQuality = "OFF" | "LOW" | "MED" | "HIGH" | "ULTRA";

export const QUALITY_LEVELS: SubsystemQuality[] = ["OFF", "LOW", "MED", "HIGH", "ULTRA"];

export interface PerceptualScore {
  importance: number; // 0..1
  subsystem: PropertyCategory;
}

/**
 * Human semantic LOD. Reduces quality per-human-subsystem, not uniformly.
 * The face/eyes/skin/hands are weighted separately from body/clothing.
 */
export class SemanticLOD {
  private quality = new Map<PropertyCategory, number>(); // 0..4 (index into QUALITY_LEVELS)

  set(category: PropertyCategory, level: SubsystemQuality): void {
    this.quality.set(category, QUALITY_LEVELS.indexOf(level));
  }

  levelFor(category: PropertyCategory): SubsystemQuality {
    return QUALITY_LEVELS[this.quality.get(category) ?? 4] ?? "HIGH";
  }

  numeric(category: PropertyCategory): number {
    return this.quality.get(category) ?? 4;
  }
}

/**
 * Perceptual LOD: computes importance from screen coverage, semantic weight,
 * focus, motion and lighting. Higher importance => keep full fidelity.
 */
export class PerceptualLOD {
  private semantic = new SemanticLOD();

  constructor(private screenHeight = 1080) {}

  /** Estimate importance of a region given its on-screen coverage (0..1). */
  scoreRegion(semanticWeight: number, coverage: number, focus = 0): number {
    return Math.min(1, semanticWeight * coverage * (0.5 + focus * 0.5));
  }

  /**
   * Build a set of kernels to execute given camera proximity and focus.
   * Close face → face/eyes/skin high; distant full-body → reduce micro detail.
   */
  lodMask(distance: number, focusOn: "face" | "body" | "hand" | "none"): Set<KernelKind> {
    const mask = new Set<KernelKind>([
      "Skinning",
      "Skeleton",
      "SparseMorph",
      "MorphAccumulation",
      "Corrective",
    ]);
    if (distance < 3 && (focusOn === "face" || focusOn === "none")) {
      // close face: keep everything
    } else if (distance < 8) {
      mask.add("Attachment");
      mask.add("Visibility");
    } else {
      // distant: drop expensive micro work
      mask.delete("Corrective");
      mask.delete("Attachment");
      mask.delete("Visibility");
      mask.add("Hair"); // hair uses cluster/card LOD
    }
    // Focus on hand: keep normals/attachment but relax face micro detail.
    if (focusOn === "hand") {
      mask.add("Normal");
    }
    return mask;
  }
}
