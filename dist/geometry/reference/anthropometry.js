/**
 * Human facial anthropometry reference (DAYTONA HD HEAD).
 *
 * The authored face was previously shaped by hand-tuned constants, which is why
 * proportions kept drifting (nose too long, jaw too weak, eyes mis-spaced). This
 * module replaces guessing with *published measurement*: the classical
 * neoclassical canons plus adult population means reported in the craniofacial
 * anthropometry literature (Farkas et al.). Those are measurements and ratios —
 * facts, not licensed model data — so they are safe to embed and ship.
 *
 * Everything here is deterministic and allocation-light: it is used both as a
 * *target* when generating geometry and as an *acceptance gate* when validating
 * a loaded base head asset.
 *
 * Units: all `*_MM` tables are millimetres; resolvers return metres to match the
 * canonical coordinate frame.
 */
/** Adult male population means (mm). */
export const ADULT_MALE_FACE_MM = Object.freeze({
    headHeight: 232.0,
    headWidth: 152.0,
    headDepth: 196.0,
    faceHeight: 187.0,
    faceWidth: 139.0,
    jawWidth: 108.0,
    lowerFaceHeight: 124.0,
    noseLength: 53.0,
    noseWidth: 35.0,
    noseProjection: 20.0,
    intercanthalWidth: 33.0,
    biocularWidth: 91.0,
    eyeWidth: 31.0,
    eyeHeight: 10.5,
    mouthWidth: 53.0,
    lipHeight: 19.0,
    upperLipHeight: 22.0,
    earHeight: 62.0,
    earWidth: 35.0,
    bridgeInset: 11.0,
    chinHeight: 42.0,
});
/** Adult female population means (mm). */
export const ADULT_FEMALE_FACE_MM = Object.freeze({
    headHeight: 220.0,
    headWidth: 146.0,
    headDepth: 187.0,
    faceHeight: 176.0,
    faceWidth: 132.0,
    jawWidth: 100.0,
    lowerFaceHeight: 116.0,
    noseLength: 49.0,
    noseWidth: 31.5,
    noseProjection: 18.0,
    intercanthalWidth: 32.0,
    biocularWidth: 87.0,
    eyeWidth: 30.0,
    eyeHeight: 10.0,
    mouthWidth: 49.5,
    lipHeight: 18.0,
    upperLipHeight: 20.0,
    earHeight: 58.0,
    earWidth: 32.0,
    bridgeInset: 10.0,
    chinHeight: 39.0,
});
const MEASUREMENT_KEYS = Object.keys(ADULT_MALE_FACE_MM);
/** Sex-neutral means: the midpoint of the two population tables. */
export const ADULT_NEUTRAL_FACE_MM = Object.freeze(MEASUREMENT_KEYS.reduce((acc, key) => {
    acc[key] = (ADULT_MALE_FACE_MM[key] + ADULT_FEMALE_FACE_MM[key]) / 2;
    return acc;
}, {}));
export function faceMeansFor(sex) {
    if (sex === 'male')
        return ADULT_MALE_FACE_MM;
    if (sex === 'female')
        return ADULT_FEMALE_FACE_MM;
    return ADULT_NEUTRAL_FACE_MM;
}
/**
 * Resolve the full measurement set in METRES, isometrically scaled to the
 * requested head height. Deterministic; no allocation beyond the result.
 */
export function resolveFaceMeasurements(req = {}) {
    const means = faceMeansFor(req.sex ?? 'neutral');
    const targetMm = req.headHeightM !== undefined ? req.headHeightM * 1000 : means.headHeight;
    const scale = targetMm / means.headHeight / 1000; // mm-table -> metres
    const out = {};
    for (const key of MEASUREMENT_KEYS)
        out[key] = means[key] * scale;
    return out;
}
export const FACE_CANONS = Object.freeze([
    {
        id: 'nose-thirds',
        description: 'Nose length (nasion-subnasale) is close to the middle third of face height. ' +
            'The classical canon states an exact 1/3; measured adult populations centre ' +
            'slightly under it, so the reference uses the measured mean.',
        numerator: 'noseLength',
        denominator: 'faceHeight',
        ratio: 0.285,
        tolerance: 0.05,
    },
    {
        id: 'intercanthal-equals-nose-width',
        description: 'Inner eye spacing equals nose breadth',
        numerator: 'intercanthalWidth',
        denominator: 'noseWidth',
        ratio: 1.0,
        tolerance: 0.14,
    },
    {
        id: 'mouth-to-nose-width',
        description: 'Mouth breadth is about 1.5x nose breadth',
        numerator: 'mouthWidth',
        denominator: 'noseWidth',
        ratio: 1.5,
        tolerance: 0.2,
    },
    {
        id: 'eye-fifths',
        description: 'One eye width is about one fifth of face breadth',
        numerator: 'eyeWidth',
        denominator: 'faceWidth',
        ratio: 0.22,
        tolerance: 0.035,
    },
    {
        id: 'ear-equals-nose-height',
        description: 'Ear height matches nose length',
        numerator: 'earHeight',
        denominator: 'noseLength',
        ratio: 1.17,
        tolerance: 0.18,
    },
    {
        id: 'jaw-to-face-width',
        description: 'Mandible breadth is about 0.77x cheekbone breadth',
        numerator: 'jawWidth',
        denominator: 'faceWidth',
        ratio: 0.775,
        tolerance: 0.06,
    },
    {
        id: 'face-to-head-height',
        description: 'Face height is about 0.8x head height',
        numerator: 'faceHeight',
        denominator: 'headHeight',
        ratio: 0.8,
        tolerance: 0.05,
    },
    {
        id: 'head-width-to-height',
        description: 'Head breadth is about 0.66x head height',
        numerator: 'headWidth',
        denominator: 'headHeight',
        ratio: 0.66,
        tolerance: 0.05,
    },
    {
        id: 'biocular-to-face-width',
        description: 'Outer eye spacing is about 0.66x face breadth',
        numerator: 'biocularWidth',
        denominator: 'faceWidth',
        ratio: 0.66,
        tolerance: 0.05,
    },
    {
        id: 'chin-to-lower-face',
        description: 'Chin height is about a third of lower face height',
        numerator: 'chinHeight',
        denominator: 'lowerFaceHeight',
        ratio: 0.34,
        tolerance: 0.06,
    },
]);
/**
 * Score a measurement set against the neoclassical canons. Works on any unit
 * system because every canon is a ratio. This is the deterministic acceptance
 * gate for authored geometry and for imported base head assets alike.
 */
export function evaluateFaceProportions(m) {
    const evaluations = [];
    for (const canon of FACE_CANONS) {
        const denom = m[canon.denominator];
        const actual = denom === 0 ? Number.NaN : m[canon.numerator] / denom;
        const deviation = Number.isFinite(actual)
            ? Math.abs(actual - canon.ratio)
            : Number.POSITIVE_INFINITY;
        evaluations.push({ canon, actual, deviation, pass: deviation <= canon.tolerance });
    }
    const failures = evaluations.filter((e) => !e.pass);
    return {
        pass: failures.length === 0,
        score: (evaluations.length - failures.length) / evaluations.length,
        evaluations,
        failures,
    };
}
/**
 * The landmark names this reference can derive measurements from. A base head
 * asset that exposes these can be measured and gated automatically.
 */
export const REQUIRED_MEASUREMENT_LANDMARKS = [
    'vertex',
    'gnathion',
    'trichion',
    'nasion',
    'sellion',
    'subnasale',
    'pronasale',
    'stomion',
    'labiale_superius',
    'labiale_inferius',
    'alare_left',
    'alare_right',
    'zygion_left',
    'zygion_right',
    'gonion_left',
    'gonion_right',
    'euryon_left',
    'euryon_right',
    'endocanthion_left',
    'endocanthion_right',
    'exocanthion_left',
    'exocanthion_right',
    'palpebrale_superius_left',
    'palpebrale_inferius_left',
    'cheilion_left',
    'cheilion_right',
    'superaurale_left',
    'subaurale_left',
    'preaurale_left',
    'postaurale_left',
    'glabella',
    'occiput',
];
const dist = (a, b) => {
    if (!a || !b)
        return Number.NaN;
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
};
/**
 * Derive the measurement set from a landmark cloud (any consistent unit). Missing
 * landmarks yield NaN for the dependent measurements, which the canon evaluator
 * reports as failures rather than silently passing.
 */
export function measureFromLandmarks(p) {
    const noseProjection = p.pronasale && p.subnasale ? Math.abs(p.pronasale[2] - p.subnasale[2]) : Number.NaN;
    const bridgeInset = p.sellion && p.pronasale ? Math.abs(p.pronasale[2] - p.sellion[2]) : Number.NaN;
    return {
        headHeight: dist(p.vertex, p.gnathion),
        headWidth: dist(p.euryon_left, p.euryon_right),
        headDepth: dist(p.glabella, p.occiput),
        faceHeight: dist(p.trichion, p.gnathion),
        faceWidth: dist(p.zygion_left, p.zygion_right),
        jawWidth: dist(p.gonion_left, p.gonion_right),
        lowerFaceHeight: dist(p.nasion, p.gnathion),
        noseLength: dist(p.nasion, p.subnasale),
        noseWidth: dist(p.alare_left, p.alare_right),
        noseProjection,
        intercanthalWidth: dist(p.endocanthion_left, p.endocanthion_right),
        biocularWidth: dist(p.exocanthion_left, p.exocanthion_right),
        eyeWidth: dist(p.endocanthion_left, p.exocanthion_left),
        eyeHeight: dist(p.palpebrale_superius_left, p.palpebrale_inferius_left),
        mouthWidth: dist(p.cheilion_left, p.cheilion_right),
        lipHeight: dist(p.labiale_superius, p.labiale_inferius),
        upperLipHeight: dist(p.subnasale, p.stomion),
        earHeight: dist(p.superaurale_left, p.subaurale_left),
        earWidth: dist(p.preaurale_left, p.postaurale_left),
        bridgeInset,
        chinHeight: dist(p.stomion, p.gnathion),
    };
}
/** Convenience: measure a landmark cloud and score it against the canons. */
export function gateLandmarkProportions(p) {
    return evaluateFaceProportions(measureFromLandmarks(p));
}
//# sourceMappingURL=anthropometry.js.map