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
export type BiologicalSex = 'male' | 'female' | 'neutral';
/**
 * The measurement vocabulary. Names follow standard craniofacial landmarks so
 * they can be compared directly against an asset's landmark set.
 */
export interface FaceMeasurements {
    /** Vertex (crown) to gnathion (chin bottom): total head height. */
    headHeight: number;
    /** Maximum head breadth (euryon to euryon). */
    headWidth: number;
    /** Glabella to occiput: head depth. */
    headDepth: number;
    /** Trichion (hairline) to gnathion: face height. */
    faceHeight: number;
    /** Zygion to zygion: cheekbone (widest face) breadth. */
    faceWidth: number;
    /** Gonion to gonion: mandible breadth. */
    jawWidth: number;
    /** Nasion to gnathion: lower face height. */
    lowerFaceHeight: number;
    /** Nasion to subnasale: nose length. */
    noseLength: number;
    /** Alare to alare: nose breadth. */
    noseWidth: number;
    /** Subnasale to nose tip, projected forward. */
    noseProjection: number;
    /** Endocanthion to endocanthion: inner eye spacing. */
    intercanthalWidth: number;
    /** Exocanthion to exocanthion: outer eye spacing. */
    biocularWidth: number;
    /** Palpebral fissure length: one visible eye width. */
    eyeWidth: number;
    /** Palpebral fissure height: one visible eye opening. */
    eyeHeight: number;
    /** Cheilion to cheilion: relaxed mouth breadth. */
    mouthWidth: number;
    /** Labiale superius to labiale inferius: closed lip height. */
    lipHeight: number;
    /** Subnasale to stomion: upper lip height. */
    upperLipHeight: number;
    /** Superaurale to subaurale: ear height. */
    earHeight: number;
    /** Ear breadth. */
    earWidth: number;
    /** Sellion depth from the corneal plane (bridge inset). */
    bridgeInset: number;
    /** Chin height, stomion to gnathion. */
    chinHeight: number;
}
/** Adult male population means (mm). */
export declare const ADULT_MALE_FACE_MM: Readonly<FaceMeasurements>;
/** Adult female population means (mm). */
export declare const ADULT_FEMALE_FACE_MM: Readonly<FaceMeasurements>;
/** Sex-neutral means: the midpoint of the two population tables. */
export declare const ADULT_NEUTRAL_FACE_MM: Readonly<FaceMeasurements>;
export declare function faceMeansFor(sex: BiologicalSex): Readonly<FaceMeasurements>;
export interface FaceProportionRequest {
    sex?: BiologicalSex;
    /**
     * Target total head height in METRES. When omitted, the population mean is
     * used. Every other measurement scales isometrically from this, which is what
     * keeps a resized head in proportion instead of stretching one feature.
     */
    headHeightM?: number;
}
/**
 * Resolve the full measurement set in METRES, isometrically scaled to the
 * requested head height. Deterministic; no allocation beyond the result.
 */
export declare function resolveFaceMeasurements(req?: FaceProportionRequest): FaceMeasurements;
/**
 * A neoclassical canon: a ratio between two measurements that a well-formed
 * human face satisfies within a tolerance. These are the checks that catch the
 * exact failures we hit by hand — an over-long nose, a narrow jaw, eyes set too
 * far apart — without needing a rendered image to notice.
 */
export interface FaceCanon {
    id: string;
    description: string;
    numerator: keyof FaceMeasurements;
    denominator: keyof FaceMeasurements;
    /** Expected ratio and the accepted absolute deviation from it. */
    ratio: number;
    tolerance: number;
}
export declare const FACE_CANONS: readonly FaceCanon[];
export interface CanonEvaluation {
    canon: FaceCanon;
    actual: number;
    deviation: number;
    pass: boolean;
}
export interface ProportionReport {
    pass: boolean;
    /** 0..1, the share of canons satisfied. */
    score: number;
    evaluations: CanonEvaluation[];
    failures: CanonEvaluation[];
}
/**
 * Score a measurement set against the neoclassical canons. Works on any unit
 * system because every canon is a ratio. This is the deterministic acceptance
 * gate for authored geometry and for imported base head assets alike.
 */
export declare function evaluateFaceProportions(m: Readonly<FaceMeasurements>): ProportionReport;
/**
 * The landmark names this reference can derive measurements from. A base head
 * asset that exposes these can be measured and gated automatically.
 */
export declare const REQUIRED_MEASUREMENT_LANDMARKS: readonly ["vertex", "gnathion", "trichion", "nasion", "sellion", "subnasale", "pronasale", "stomion", "labiale_superius", "labiale_inferius", "alare_left", "alare_right", "zygion_left", "zygion_right", "gonion_left", "gonion_right", "euryon_left", "euryon_right", "endocanthion_left", "endocanthion_right", "exocanthion_left", "exocanthion_right", "palpebrale_superius_left", "palpebrale_inferius_left", "cheilion_left", "cheilion_right", "superaurale_left", "subaurale_left", "preaurale_left", "postaurale_left", "glabella", "occiput"];
export type MeasurementLandmarkName = (typeof REQUIRED_MEASUREMENT_LANDMARKS)[number];
export type LandmarkPositions = Partial<Record<MeasurementLandmarkName, readonly [number, number, number]>>;
/**
 * Derive the measurement set from a landmark cloud (any consistent unit). Missing
 * landmarks yield NaN for the dependent measurements, which the canon evaluator
 * reports as failures rather than silently passing.
 */
export declare function measureFromLandmarks(p: LandmarkPositions): FaceMeasurements;
/** Convenience: measure a landmark cloud and score it against the canons. */
export declare function gateLandmarkProportions(p: LandmarkPositions): ProportionReport;
//# sourceMappingURL=anthropometry.d.ts.map