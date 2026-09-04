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
export declare class ShapeCoefficientSolver {
    private registry;
    constructor(registry: PropertyRegistry);
    /** Coefficient for one basis given its driving property's current value. */
    weightForProperty(propPath: string, value: number): number;
    /**
     * Resolve coefficients for every basis in the shape space from the current
     * definition. Only bases whose driving property is present get a coefficient
     * (others default to 0 = identity).
     */
    solve(definition: HumanDefinition, shapeSpace: HumanShapeSpace): Map<number, number>;
}
//# sourceMappingURL=shape-coefficient-solver.d.ts.map