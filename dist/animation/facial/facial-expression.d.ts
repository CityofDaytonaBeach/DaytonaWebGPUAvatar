import { HumanDefinition } from '../../core/schema/human-definition.js';
export type SemanticExpression = 'neutral' | 'smile' | 'frown' | 'surprise' | 'anger' | 'sad' | 'serious' | 'thinking';
/**
 * Semantic expressions -> low-level ARKit-compatible facial controls.
 * Identity and expression stay separate: expressions only write
 * `expression.*` performance properties, never identity ones.
 */
export declare class FacialExpressionSystem {
    /** Blend semantic expression into the definition's expression controls. */
    apply(definition: HumanDefinition, expr: SemanticExpression, intensity: number): void;
}
//# sourceMappingURL=facial-expression.d.ts.map