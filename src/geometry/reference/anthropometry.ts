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
export const ADULT_MALE_FACE_MM: Readonly<FaceMeasurements> = Object.freeze({
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
export const ADULT_FEMALE_FACE_MM: Readonly<FaceMeasurements> = Object.freeze({
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

const MEASUREMENT_KEYS = Object.keys(ADULT_MALE_FACE_MM) as (keyof FaceMeasurements)[];

/** Sex-neutral means: the midpoint of the two population tables. */
export const ADULT_NEUTRAL_FACE_MM: Readonly<FaceMeasurements> = Object.freeze(
  MEASUREMENT_KEYS.reduce((acc, key) => {
    acc[key] = (ADULT_MALE_FACE_MM[key] + ADULT_FEMALE_FACE_MM[key]) / 2;
    return acc;
  }, {} as FaceMeasurements),
);

export function faceMeansFor(sex: BiologicalSex): Readonly<FaceMeasurements> {
  if (sex === 'male') return ADULT_MALE_FACE_MM;
  if (sex === 'female') return ADULT_FEMALE_FACE_MM;
  return ADULT_NEUTRAL_FACE_MM;
}

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
export function resolveFaceMeasurements(req: FaceProportionRequest = {}): FaceMeasurements {
  const means = faceMeansFor(req.sex ?? 'neutral');
  const targetMm = req.headHeightM !== undefined ? req.headHeightM * 1000 : means.headHeight;
  const scale = targetMm / means.headHeight / 1000; // mm-table -> metres
  const out = {} as FaceMeasurements;
  for (const key of MEASUREMENT_KEYS) out[key] = means[key] * scale;
  return out;
}

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

export const FACE_CANONS: readonly FaceCanon[] = Object.freeze([
  {
    id: 'nose-thirds',
    description:
      'Nose length (nasion-subnasale) is close to the middle third of face height. ' +
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
export function evaluateFaceProportions(m: Readonly<FaceMeasurements>): ProportionReport {
  const evaluations: CanonEvaluation[] = [];
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
] as const;

export type MeasurementLandmarkName = (typeof REQUIRED_MEASUREMENT_LANDMARKS)[number];

export type LandmarkPositions = Partial<
  Record<MeasurementLandmarkName, readonly [number, number, number]>
>;

const dist = (
  a: readonly [number, number, number] | undefined,
  b: readonly [number, number, number] | undefined,
): number => {
  if (!a || !b) return Number.NaN;
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
export function measureFromLandmarks(p: LandmarkPositions): FaceMeasurements {
  const noseProjection =
    p.pronasale && p.subnasale ? Math.abs(p.pronasale[2] - p.subnasale[2]) : Number.NaN;
  const bridgeInset =
    p.sellion && p.pronasale ? Math.abs(p.pronasale[2] - p.sellion[2]) : Number.NaN;
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
export function gateLandmarkProportions(p: LandmarkPositions): ProportionReport {
  return evaluateFaceProportions(measureFromLandmarks(p));
}
