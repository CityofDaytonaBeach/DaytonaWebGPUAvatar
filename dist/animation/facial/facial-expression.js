/**
 * Semantic expressions -> low-level ARKit-compatible facial controls.
 * Identity and expression stay separate: expressions only write
 * `expression.*` performance properties, never identity ones.
 */
export class FacialExpressionSystem {
    /** Blend semantic expression into the definition's expression controls. */
    apply(definition, expr, intensity) {
        const e = Math.max(0, Math.min(1, intensity));
        const controls = {};
        switch (expr) {
            case 'neutral':
                break;
            case 'smile':
                controls['expression.mouthSmileLeft'] = e;
                controls['expression.mouthSmileRight'] = e;
                controls['expression.cheekSquintLeft'] = e * 0.4;
                controls['expression.cheekSquintRight'] = e * 0.4;
                break;
            case 'frown':
                controls['expression.mouthFrownLeft'] = e;
                controls['expression.mouthFrownRight'] = e;
                controls['expression.browDownLeft'] = e * 0.5;
                controls['expression.browDownRight'] = e * 0.5;
                break;
            case 'surprise':
                controls['expression.jawOpen'] = e;
                controls['expression.eyeWideLeft'] = e;
                controls['expression.eyeWideRight'] = e;
                controls['expression.browInnerUp'] = e;
                break;
            case 'anger':
                controls['expression.browDownLeft'] = e;
                controls['expression.browDownRight'] = e;
                controls['expression.eyeSquintLeft'] = e * 0.6;
                controls['expression.eyeSquintRight'] = e * 0.6;
                controls['expression.mouthFrownLeft'] = e * 0.7;
                controls['expression.mouthFrownRight'] = e * 0.7;
                break;
            case 'sad':
                controls['expression.browInnerUp'] = e;
                controls['expression.mouthFrownLeft'] = e;
                controls['expression.mouthFrownRight'] = e;
                break;
            case 'serious':
                controls['expression.mouthPucker'] = e * 0.3;
                controls['expression.eyeSquintLeft'] = e * 0.3;
                controls['expression.eyeSquintRight'] = e * 0.3;
                break;
            case 'thinking':
                controls['expression.eyeSquintLeft'] = e * 0.5;
                controls['expression.mouthPucker'] = e * 0.4;
                break;
        }
        for (const [path, value] of Object.entries(controls)) {
            definition.set(path, value);
        }
    }
}
//# sourceMappingURL=facial-expression.js.map