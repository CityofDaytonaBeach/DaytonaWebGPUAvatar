function quatMul(a, b) {
    return {
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
}
function quatConjugate(q) {
    return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}
/** Deflection angle (degrees) of a quaternion relative to a reference about an axis. */
function decoupleAngle(q, rest, axis) {
    const rel = quatMul(q, quatConjugate(rest));
    const w = Math.max(-1, Math.min(1, rel.w));
    const half = Math.acos(w);
    let sign = 1;
    if (axis === 'x')
        sign = rel.x >= 0 ? 1 : -1;
    else if (axis === 'y')
        sign = rel.y >= 0 ? 1 : -1;
    else
        sign = rel.z >= 0 ? 1 : -1;
    return (2 * half * sign * 180) / Math.PI;
}
/** Identity-shaped coefficient from a property value (mirrors ShapeCoefficientSolver). */
function coefficientFor(value, min, max, def) {
    if (def !== 0)
        return value / def - 1;
    const span = max - min;
    if (span <= 0)
        return 0;
    return Math.min(1, Math.max(0, (value - min) / span));
}
/**
 * Maps semantic property values into morph weights that drive the GPU/CPU
 * morph pipeline.
 *
 * One property (e.g. face.eyeSpacing) may drive several morphs spread across
 * multiple parts/regions (body eye boxes, sclera, iris), so a property maps to
 * a list of morph names all sharing the same weight. Corrective morphs are
 * weighted by the continuous product of multiple shaped coefficients.
 *
 * Weight model (matches ShapeCoefficientSolver for consistency):
 *   - default != 0 : (value / default) - 1  (a ratio about neutral)
 *   - default == 0 : value scaled into the property's (min,max) as 0..1
 */
export class MorphDriver {
    registry;
    /** morphName -> weight source (a property path, a corrective combination, or a bone). */
    morphToProperty = new Map();
    properties = new Set();
    /** Current skeleton + pose, used to evaluate bone-driven sources. */
    bones = [];
    poses = new Map();
    constructor(registry) {
        this.registry = registry;
        this.register('face.nose.width', 'noseWidth');
        this.register('face.jaw.width', 'jawWidth');
        this.register('face.eyeSpacing', 'eyeSpacing', 'eyeSpacingSclera', 'eyeSpacingIris');
        this.register('face.mouth.width', 'mouthWidth');
        this.register('expression.jawOpen', 'jawOpen', 'jawOpenCavity');
    }
    register(propPath, ...morphNames) {
        void this.registry.require(propPath);
        this.properties.add(propPath);
        for (const n of morphNames)
            this.morphToProperty.set(n, propPath);
    }
    /**
     * Public registration of a single-property (linear) morph — used to wire shape
     * bases compiled into sparse morphs back to their driving property.
     */
    registerBasis(name, propPath) {
        this.register(propPath, name);
    }
    /**
     * Register a bone-driven (pose) morph: its weight is the deflection coefficient
     * of the named bone about `axis` relative to rest. Pose is supplied via setPose().
     */
    registerBone(name, boneName, axis, neutralDeg, spanDeg) {
        this.morphToProperty.set(name, { kind: 'bone', boneName, axis, neutralDeg, spanDeg });
    }
    /**
     * Register a corrective morph driven by the continuous product of several
     * shaped coefficients (properties and/or bone deflections). The corrective is
     * exposed as a normal sparse morph so the existing GPU morph pipeline consumes
     * it (weight == product of inputs).
     */
    registerCorrective(morphName, inputs) {
        for (const input of inputs) {
            if (input.property) {
                void this.registry.require(input.property);
                this.properties.add(input.property);
            }
        }
        this.morphToProperty.set(morphName, { kind: 'corrective', inputs });
    }
    /**
     * Set the current skeleton + pose used to evaluate bone-driven weight sources.
     * Called by Human whenever a pose is applied so pose changes flow into the morph
     * pipeline (P15 pose correctives).
     */
    setPose(bones, poses = []) {
        this.bones = bones;
        this.poses = new Map(poses.map((p) => [p.name, p]));
    }
    /** Morph names driven by a property path (linear, single-property morphs). */
    morphsForProperty(propPath) {
        const meta = this.registry.require(propPath);
        const id = meta.id;
        const out = [];
        for (const [m, p] of this.morphToProperty) {
            if (typeof p === 'string' && p === propPath && this.registry.require(p).id === id)
                out.push(m);
        }
        return out;
    }
    /** True if a morph's weight source references the given property path. */
    morphUsesProperty(morphName, propPath) {
        const source = this.morphToProperty.get(morphName);
        if (typeof source === 'string')
            return source === propPath;
        if (source && source.kind === 'corrective') {
            return source.inputs.some((i) => i.property === propPath);
        }
        return false;
    }
    /** True if a morph is driven by the named bone (pose corrective). */
    morphUsesBone(morphName, boneName) {
        const source = this.morphToProperty.get(morphName);
        if (typeof source !== 'string' && source && source.kind === 'bone')
            return source.boneName === boneName;
        if (typeof source !== 'string' && source && source.kind === 'corrective') {
            return source.inputs.some((i) => i.boneName === boneName);
        }
        return false;
    }
    /** Bone deflection coefficient for a single-input bone source. */
    boneCoefficient(input, definition) {
        void definition;
        const bone = this.bones.find((b) => b.name === input.boneName);
        if (!bone)
            return 0;
        const pose = this.poses.get(input.boneName);
        const qRest = bone.restRotation;
        const qPose = pose ? pose.localRot : qRest;
        const angle = decoupleAngle(qPose, qRest, input.axis) - input.neutralDeg;
        const span = input.spanDeg <= 0 ? 1 : input.spanDeg;
        return Math.max(-1, Math.min(1, angle / span));
    }
    /** Weight of a morph based on the current definition. 0 = neutral. */
    weight(definition, morphName) {
        const source = this.morphToProperty.get(morphName);
        if (!source)
            return 0;
        if (typeof source === 'string') {
            const meta = this.registry.require(source);
            return coefficientFor(definition.get(source), typeof meta.min === 'number' ? meta.min : 0, typeof meta.max === 'number' ? meta.max : 1, meta.default);
        }
        if (source.kind === 'bone')
            return this.boneCoefficient(source, definition);
        if (source.kind === 'corrective') {
            let acc = 1;
            for (const input of source.inputs) {
                let c = 0;
                if (input.boneName) {
                    c = this.boneCoefficient(input, definition);
                }
                else {
                    const p = input;
                    const meta = this.registry.require(p.property);
                    c = coefficientFor(definition.get(p.property), typeof meta.min === 'number' ? meta.min : 0, typeof meta.max === 'number' ? meta.max : 1, meta.default);
                    if (p.influence)
                        c = p.influence(c);
                }
                acc *= c;
                if (acc === 0)
                    break;
            }
            return acc;
        }
        return 0;
    }
}
//# sourceMappingURL=morph-driver.js.map