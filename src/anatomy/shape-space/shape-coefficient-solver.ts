import { PropertyRegistry } from '../../core/schema/registry.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { HumanShapeSpace } from './human-shape-space.js';

/**
 * Given a HumanDefinition, compute the scalar coefficient for every registered
 * shape basis. A coefficient of 0 means "identity/neutral" (no displacement).
 *
 * Weight model (mirrors MorphDriver so the two pipelines stay consistent):
 *   - default != 0 : value / default - 1   (a ratio about neutral)
 *   - default == 0 : (value - min) / (max - min) clamped to [0,1]
 */
export class ShapeCoefficientSolver {
  constructor(private registry: PropertyRegistry) {}

  /** Coefficient for one basis given its driving property's current value. */
  weightForProperty(propPath: string, value: number): number {
    const meta = this.registry.require(propPath);
    if (meta.default !== 0) return value / meta.default - 1;
    const lo = typeof meta.min === 'number' ? meta.min : 0;
    const hi = typeof meta.max === 'number' ? meta.max : 1;
    const span = hi - lo;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (value - lo) / span));
  }

  /**
   * Resolve coefficients for every basis in the shape space from the current
   * definition. Only bases whose driving property is present get a coefficient
   * (others default to 0 = identity).
   */
  solve(definition: HumanDefinition, shapeSpace: HumanShapeSpace): Map<number, number> {
    const out = new Map<number, number>();
    for (const basis of shapeSpace.bases.list()) {
      const value = definition.get(basis.property);
      const coeff = this.weightForProperty(basis.property, value);
      out.set(basis.id, coeff);
    }
    return out;
  }
}
