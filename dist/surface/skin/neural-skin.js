// â”€â”€â”€ New enums & types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export var SkinPreset;
(function (SkinPreset) {
    SkinPreset["Porcelain"] = "porcelain";
    SkinPreset["Fair"] = "fair";
    SkinPreset["LightOlive"] = "light_olive";
    SkinPreset["Olive"] = "olive";
    SkinPreset["Tan"] = "tan";
    SkinPreset["Brown"] = "brown";
    SkinPreset["DarkBrown"] = "dark_brown";
    SkinPreset["Deep"] = "deep";
})(SkinPreset || (SkinPreset = {}));
export const SKIN_PRESETS = {
    [SkinPreset.Porcelain]: {
        baseColor: [0.96, 0.87, 0.82],
        melanin: 0.05,
        hemoglobin: 0.35,
        carotene: 0.15,
        roughness: 0.38,
        specular: 0.42,
        sssColor: [0.95, 0.64, 0.54],
        sssIntensity: 0.45,
        poreScale: 0.3,
        wrinkleDepth: 0.1,
        freckleDensity: 0.02,
    },
    [SkinPreset.Fair]: {
        baseColor: [0.91, 0.78, 0.7],
        melanin: 0.12,
        hemoglobin: 0.3,
        carotene: 0.18,
        roughness: 0.4,
        specular: 0.4,
        sssColor: [0.9, 0.58, 0.48],
        sssIntensity: 0.4,
        poreScale: 0.4,
        wrinkleDepth: 0.15,
        freckleDensity: 0.08,
    },
    [SkinPreset.LightOlive]: {
        baseColor: [0.82, 0.7, 0.58],
        melanin: 0.25,
        hemoglobin: 0.22,
        carotene: 0.2,
        roughness: 0.42,
        specular: 0.38,
        sssColor: [0.85, 0.5, 0.4],
        sssIntensity: 0.35,
        poreScale: 0.5,
        wrinkleDepth: 0.2,
        freckleDensity: 0.05,
    },
    [SkinPreset.Olive]: {
        baseColor: [0.72, 0.58, 0.46],
        melanin: 0.38,
        hemoglobin: 0.18,
        carotene: 0.22,
        roughness: 0.44,
        specular: 0.36,
        sssColor: [0.78, 0.42, 0.34],
        sssIntensity: 0.3,
        poreScale: 0.55,
        wrinkleDepth: 0.25,
        freckleDensity: 0.04,
    },
    [SkinPreset.Tan]: {
        baseColor: [0.64, 0.48, 0.36],
        melanin: 0.48,
        hemoglobin: 0.16,
        carotene: 0.18,
        roughness: 0.46,
        specular: 0.34,
        sssColor: [0.7, 0.38, 0.3],
        sssIntensity: 0.28,
        poreScale: 0.6,
        wrinkleDepth: 0.28,
        freckleDensity: 0.03,
    },
    [SkinPreset.Brown]: {
        baseColor: [0.52, 0.38, 0.28],
        melanin: 0.6,
        hemoglobin: 0.14,
        carotene: 0.14,
        roughness: 0.48,
        specular: 0.32,
        sssColor: [0.6, 0.32, 0.24],
        sssIntensity: 0.25,
        poreScale: 0.65,
        wrinkleDepth: 0.3,
        freckleDensity: 0.02,
    },
    [SkinPreset.DarkBrown]: {
        baseColor: [0.38, 0.26, 0.18],
        melanin: 0.75,
        hemoglobin: 0.12,
        carotene: 0.1,
        roughness: 0.5,
        specular: 0.3,
        sssColor: [0.48, 0.26, 0.2],
        sssIntensity: 0.22,
        poreScale: 0.7,
        wrinkleDepth: 0.35,
        freckleDensity: 0.01,
    },
    [SkinPreset.Deep]: {
        baseColor: [0.24, 0.16, 0.1],
        melanin: 0.9,
        hemoglobin: 0.1,
        carotene: 0.06,
        roughness: 0.52,
        specular: 0.28,
        sssColor: [0.36, 0.2, 0.15],
        sssIntensity: 0.18,
        poreScale: 0.75,
        wrinkleDepth: 0.38,
        freckleDensity: 0.005,
    },
};
export const REGION_MATERIALS = {
    face: {
        roughness: 0.35,
        specular: 0.45,
        sssIntensity: 0.4,
        poreScale: 1.2,
        wrinkleSusceptibility: 1.0,
        oiliness: 0.8,
    },
    nose: {
        roughness: 0.3,
        specular: 0.5,
        sssIntensity: 0.35,
        poreScale: 1.5,
        wrinkleSusceptibility: 0.3,
        oiliness: 1.0,
    },
    jaw: {
        roughness: 0.38,
        specular: 0.42,
        sssIntensity: 0.38,
        poreScale: 1.1,
        wrinkleSusceptibility: 0.6,
        oiliness: 0.7,
    },
    head: {
        roughness: 0.4,
        specular: 0.4,
        sssIntensity: 0.35,
        poreScale: 0.8,
        wrinkleSusceptibility: 0.4,
        oiliness: 0.5,
    },
    neck: {
        roughness: 0.42,
        specular: 0.38,
        sssIntensity: 0.42,
        poreScale: 0.6,
        wrinkleSusceptibility: 0.7,
        oiliness: 0.4,
    },
    torso: {
        roughness: 0.5,
        specular: 0.3,
        sssIntensity: 0.3,
        poreScale: 0.5,
        wrinkleSusceptibility: 0.2,
        oiliness: 0.3,
    },
    upperarm_l: {
        roughness: 0.48,
        specular: 0.32,
        sssIntensity: 0.32,
        poreScale: 0.5,
        wrinkleSusceptibility: 0.3,
        oiliness: 0.3,
    },
    upperarm_r: {
        roughness: 0.48,
        specular: 0.32,
        sssIntensity: 0.32,
        poreScale: 0.5,
        wrinkleSusceptibility: 0.3,
        oiliness: 0.3,
    },
    forearm_l: {
        roughness: 0.46,
        specular: 0.34,
        sssIntensity: 0.3,
        poreScale: 0.55,
        wrinkleSusceptibility: 0.4,
        oiliness: 0.35,
    },
    forearm_r: {
        roughness: 0.46,
        specular: 0.34,
        sssIntensity: 0.3,
        poreScale: 0.55,
        wrinkleSusceptibility: 0.4,
        oiliness: 0.35,
    },
    hand_l: {
        roughness: 0.55,
        specular: 0.28,
        sssIntensity: 0.25,
        poreScale: 0.9,
        wrinkleSusceptibility: 0.8,
        oiliness: 0.2,
    },
    hand_r: {
        roughness: 0.55,
        specular: 0.28,
        sssIntensity: 0.25,
        poreScale: 0.9,
        wrinkleSusceptibility: 0.8,
        oiliness: 0.2,
    },
    thigh_l: {
        roughness: 0.52,
        specular: 0.28,
        sssIntensity: 0.28,
        poreScale: 0.45,
        wrinkleSusceptibility: 0.2,
        oiliness: 0.25,
    },
    thigh_r: {
        roughness: 0.52,
        specular: 0.28,
        sssIntensity: 0.28,
        poreScale: 0.45,
        wrinkleSusceptibility: 0.2,
        oiliness: 0.25,
    },
    shin_l: {
        roughness: 0.54,
        specular: 0.26,
        sssIntensity: 0.26,
        poreScale: 0.4,
        wrinkleSusceptibility: 0.25,
        oiliness: 0.2,
    },
    shin_r: {
        roughness: 0.54,
        specular: 0.26,
        sssIntensity: 0.26,
        poreScale: 0.4,
        wrinkleSusceptibility: 0.25,
        oiliness: 0.2,
    },
};
// â”€â”€â”€ Core noise primitives (deterministic, zero-dep) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function noise1D(seed, x) {
    const v = Math.sin(seed * 127.1 + x * 311.7) * 43758.5453;
    return v - Math.floor(v);
}
function noise2D(seed, x, y) {
    const v = Math.sin(seed * 12.9898 + x * 78.233 + y * 37.719) * 43758.5453;
    return v - Math.floor(v);
}
/** Value noise with smooth interpolation (deterministic). */
function valueNoise2D(seed, x, y, frequency) {
    const fx = x * frequency;
    const fy = y * frequency;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const u = tx * tx * (3 - 2 * tx);
    const v = ty * ty * (3 - 2 * ty);
    const a = noise2D(seed, ix, iy);
    const b = noise2D(seed, ix + 1, iy);
    const c = noise2D(seed, ix, iy + 1);
    const d = noise2D(seed, ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Fractal Brownian Motion: multi-octave layered value noise. */
function fbm2D(seed, x, y, octaves, lacunarity, gain) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * valueNoise2D(seed + i * 31.0, x, y, frequency);
        maxValue += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
    }
    return value / maxValue;
}
// â”€â”€â”€ Seeded PRNG (xorshift32, deterministic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function xorshift32(state) {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state >>> 0;
}
function seededRandom(seed) {
    let s = seed >>> 0;
    if (s === 0)
        s = 1;
    return () => {
        s = xorshift32(s);
        return s / 4294967296;
    };
}
// â”€â”€â”€ Legacy noise (kept for backward compatibility) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function noise(seed, a, b) {
    const x = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453;
    return x - Math.floor(x);
}
// â”€â”€â”€ Utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}
function clampDelta(v) {
    return clamp(v, -0.12, 0.12);
}
function isSkinRegion(region) {
    return (region !== 'eye_sclera' &&
        region !== 'eye_iris' &&
        region !== 'teeth' &&
        region !== 'tongue' &&
        region !== 'mouth_cavity');
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function lerpColor(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
// â”€â”€â”€ Skin aging model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Computes a composite aging state from definition parameters.
 * Combines chronological age, UV exposure, and moisture loss into
 * derived metrics that drive wrinkle, pigment, and elasticity changes.
 */
export function computeAgingState(definition, overrides) {
    const age = clamp(definition.get('skin.age') / 100, 0, 1);
    const uvExposure = clamp(definition.get('skin.roughness') ?? 0.3, 0, 1);
    const moisture = clamp(1 - (definition.get('skin.wetness') ?? 0.5), 0, 1);
    // Non-linear aging: accelerates after 0.5 and with UV/moisture stress
    const ageCurve = age * age * (3 - 2 * age); // smoothstep
    const uvMultiplier = 1 + uvExposure * 0.4;
    const moistureMultiplier = 1 + moisture * 0.3;
    const effectiveAge = clamp(ageCurve * uvMultiplier * moistureMultiplier, 0, 1);
    const elasticity = clamp(1 - effectiveAge * 0.7 - uvExposure * 0.15, 0, 1);
    const collagenLoss = clamp(effectiveAge * 0.6 + uvExposure * 0.2, 0, 1);
    const wrinkleDepth = clamp(effectiveAge * 0.8 + (1 - elasticity) * 0.3, 0, 1);
    const pigmentationVariation = clamp(effectiveAge * 0.5 + uvExposure * 0.3 + noise1D(77, effectiveAge * 10) * 0.1, 0, 1);
    const state = {
        age: effectiveAge,
        uvExposure,
        moisture,
        elasticity,
        collagenLoss,
        wrinkleDepth,
        pigmentationVariation,
    };
    return overrides ? { ...state, ...overrides } : state;
}
// â”€â”€â”€ Pore detail generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Multi-scale pore detail. Generates coarse (large pores),
 * medium, and fine (micro-texture) layers independently, then combines.
 */
export function generatePoreDetail(vertexId, uv, region, options = {}) {
    const scales = clamp(Math.floor(options.scales ?? 3), 1, 5);
    const regionScale = (REGION_MATERIALS[region] ?? REGION_MATERIALS.torso).poreScale;
    let coarse = 0;
    let medium = 0;
    let fine = 0;
    // Coarse pores (large surface features)
    if (scales >= 1) {
        coarse = fbm2D(vertexId * 3, uv.u, uv.v, 2, 2.0, 0.5) * regionScale;
    }
    // Medium pores
    if (scales >= 2) {
        medium = fbm2D(vertexId * 3 + 100, uv.u, uv.v, 3, 2.2, 0.45) * regionScale;
    }
    // Fine micro-pores
    if (scales >= 3) {
        fine = fbm2D(vertexId * 3 + 200, uv.u, uv.v, 4, 2.5, 0.4) * regionScale;
    }
    // Extra-fine scales (skin grain)
    for (let s = 4; s <= scales; s++) {
        fine += fbm2D(vertexId * 3 + s * 300, uv.u, uv.v, 2, 3.0, 0.35) * regionScale * 0.3;
    }
    const combined = clamp(coarse * 0.4 + medium * 0.35 + fine * 0.25, 0, 1);
    return {
        vertexId,
        region,
        coarse: clamp(coarse, 0, 1),
        medium: clamp(medium, 0, 1),
        fine: clamp(fine, 0, 1),
        combined,
    };
}
// â”€â”€â”€ Wrinkle/fold map generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Derives wrinkle depth and direction per vertex from expression intensity
 * and anatomical aging state. Wrinkle direction follows the local UV gradient
 * of the wrinkle noise field.
 */
export function generateWrinkleMap(vertices, aging, options = {}) {
    const expressionIntensity = clamp(options.expressionIntensity ?? 0.5, 0, 1);
    const baseDepth = aging.wrinkleDepth;
    return vertices
        .filter((v) => isSkinRegion(v.region))
        .map((v) => {
        const regionMat = REGION_MATERIALS[v.region] ?? REGION_MATERIALS.torso;
        const wrinkleSusceptibility = regionMat.wrinkleSusceptibility;
        // Dominant wrinkle pattern (character lines)
        const w1 = fbm2D(v.id * 7, v.uv.u, v.uv.v, 3, 2.0, 0.5);
        // Secondary fold pattern (expression-driven)
        const w2 = fbm2D(v.id * 7 + 500, v.uv.u * 2, v.uv.v * 2, 2, 2.0, 0.5);
        // Depth combines aging, expression, and regional susceptibility
        const depth = clamp(baseDepth * wrinkleSusceptibility * 0.6 +
            w1 * expressionIntensity * wrinkleSusceptibility * 0.3 +
            w2 * expressionIntensity * 0.1, 0, 1);
        // Direction via finite-difference gradient of wrinkle field
        const eps = 0.001;
        const dx = fbm2D(v.id * 7, v.uv.u + eps, v.uv.v, 3, 2.0, 0.5) -
            fbm2D(v.id * 7, v.uv.u - eps, v.uv.v, 3, 2.0, 0.5);
        const dy = fbm2D(v.id * 7, v.uv.u, v.uv.v + eps, 3, 2.0, 0.5) -
            fbm2D(v.id * 7, v.uv.u, v.uv.v - eps, 3, 2.0, 0.5);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return {
            vertexId: v.id,
            region: v.region,
            depth,
            direction: [dx / len, dy / len],
        };
    });
}
// â”€â”€â”€ Blemish system â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Procedural blemish placement. Generates moles, freckles, scars, and liver
 * spots with deterministic seeded placement controlled by density and seed.
 */
export function generateBlemishes(vertices, definition, options = {}) {
    const density = clamp(options.density ?? 0.5, 0, 1);
    const seed = options.seed ?? 42;
    const allowScars = options.allowScars ?? true;
    const pigmentation = definition.get('skin.pigmentation');
    const age = definition.get('skin.age') / 100;
    const rng = seededRandom(seed);
    const blemishes = [];
    for (const v of vertices) {
        if (!isSkinRegion(v.region))
            continue;
        const r = rng();
        // Freckles: probabilistic per-vertex, denser on face/nose
        const freckleChance = density *
            0.02 *
            (v.region === 'face' || v.region === 'nose' ? 3.0 : 1.0) *
            (0.5 + pigmentation * 0.5);
        if (r < freckleChance) {
            const intensity = 0.1 + rng() * 0.3;
            blemishes.push({
                kind: 'freckle',
                vertexId: v.id,
                region: v.region,
                uv: v.uv,
                size: 0.002 + rng() * 0.005,
                intensity,
                colorShift: [
                    clamp(pigmentation * 0.06 + rng() * 0.02, 0, 0.12),
                    clamp(pigmentation * 0.03 + rng() * 0.01, 0, 0.08),
                    clamp(-0.01 + rng() * 0.01, -0.02, 0.02),
                ],
            });
            continue;
        }
        // Moles: rare, larger, more concentrated color
        const moleChance = density * 0.005 * (0.5 + age * 0.5);
        if (r < freckleChance + moleChance) {
            blemishes.push({
                kind: 'mole',
                vertexId: v.id,
                region: v.region,
                uv: v.uv,
                size: 0.003 + rng() * 0.008,
                intensity: 0.3 + rng() * 0.4,
                colorShift: [
                    clamp(0.04 + rng() * 0.06, 0, 0.15),
                    clamp(0.02 + rng() * 0.03, 0, 0.1),
                    clamp(-0.02 + rng() * 0.01, -0.04, 0.01),
                ],
            });
            continue;
        }
        // Liver spots: age-dependent, on sun-exposed areas
        const liverChance = density * 0.003 * Math.max(0, age - 0.4) * 2;
        if (r < freckleChance + moleChance + liverChance) {
            blemishes.push({
                kind: 'liver_spot',
                vertexId: v.id,
                region: v.region,
                uv: v.uv,
                size: 0.005 + rng() * 0.015,
                intensity: 0.15 + rng() * 0.25,
                colorShift: [
                    clamp(pigmentation * 0.04 + rng() * 0.03, 0, 0.1),
                    clamp(pigmentation * 0.02 + rng() * 0.015, 0, 0.06),
                    clamp(-0.005, -0.02, 0.005),
                ],
            });
            continue;
        }
        // Scars: very rare, only if allowed
        if (allowScars) {
            const scarChance = density * 0.001;
            if (r < freckleChance + moleChance + liverChance + scarChance) {
                blemishes.push({
                    kind: 'scar',
                    vertexId: v.id,
                    region: v.region,
                    uv: v.uv,
                    size: 0.008 + rng() * 0.02,
                    intensity: 0.2 + rng() * 0.3,
                    colorShift: [
                        clamp(0.01 + rng() * 0.02 - 0.01, -0.02, 0.04),
                        clamp(0.005 + rng() * 0.01 - 0.005, -0.01, 0.02),
                        clamp(0.01 + rng() * 0.01, 0, 0.03),
                    ],
                });
            }
        }
    }
    return blemishes;
}
// â”€â”€â”€ Sub-surface scattering approximation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Approximates per-vertex SSS scatter color and depth.
 * Uses anatomical thickness estimate from region + age-derived
 * absorption to produce scatter color for translucent skin shading.
 */
export function computeSSSApproximation(vertexId, region, aging, preset) {
    const regionMat = REGION_MATERIALS[region] ?? REGION_MATERIALS.torso;
    // Tissue thickness estimate (thinner on nose/hands, thicker on torso)
    const thicknessFactor = 1 - regionMat.sssIntensity * 0.5;
    // Blood absorption shifts scatter toward red as tissue thins with age
    const bloodAbsorption = 1 - aging.elasticity * 0.3;
    const scatterR = preset.sssColor[0] * bloodAbsorption;
    const scatterG = preset.sssColor[1] * (0.8 + aging.age * 0.15);
    const scatterB = preset.sssColor[2] * (0.7 + aging.moisture * 0.2);
    const depth = clamp(preset.sssIntensity * thicknessFactor * (1 - aging.collagenLoss * 0.2), 0, 1);
    return {
        color: [clamp(scatterR, 0, 1), clamp(scatterG, 0, 1), clamp(scatterB, 0, 1)],
        depth,
    };
}
// â”€â”€â”€ GPU material export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Per-vertex tangent-space normal perturbation from multi-scale pore and
 * wrinkle detail. Returns [perturbX, perturbY] where the tangent-space
 * normal is reconstructed as (perturbX, perturbY, sqrt(1 - x^2 - y^2)).
 */
export function generateNormalPerturbation(vertexId, uv, region, aging, poreDetailCombined, wrinkleDepthVal, strength = 1) {
    const regionMat = REGION_MATERIALS[region] ?? REGION_MATERIALS.torso;
    const regionScale = regionMat.poreScale;
    const poreNx = (fbm2D(vertexId * 11 + 700, uv.u, uv.v, 3, 4.0, 0.45) - 0.5) *
        0.06 *
        regionScale *
        poreDetailCombined;
    const poreNy = (fbm2D(vertexId * 11 + 800, uv.u, uv.v, 3, 4.0, 0.45) - 0.5) *
        0.06 *
        regionScale *
        poreDetailCombined;
    const wrinkleNx = (fbm2D(vertexId * 13 + 900, uv.u, uv.v, 2, 2.0, 0.5) - 0.5) *
        0.1 *
        regionMat.wrinkleSusceptibility *
        wrinkleDepthVal *
        aging.wrinkleDepth;
    const wrinkleNy = (fbm2D(vertexId * 13 + 1000, uv.u, uv.v, 2, 2.0, 0.5) - 0.5) *
        0.1 *
        regionMat.wrinkleSusceptibility *
        wrinkleDepthVal *
        aging.wrinkleDepth;
    const grainNx = (fbm2D(vertexId * 17 + 1100, uv.u * 3, uv.v * 3, 2, 5.0, 0.35) - 0.5) * 0.02 * regionScale;
    const grainNy = (fbm2D(vertexId * 17 + 1200, uv.u * 3, uv.v * 3, 2, 5.0, 0.35) - 0.5) * 0.02 * regionScale;
    const totalX = clamp((poreNx + wrinkleNx + grainNx) * strength, -0.35, 0.35);
    const totalY = clamp((poreNy + wrinkleNy + grainNy) * strength, -0.35, 0.35);
    const mag2 = totalX * totalX + totalY * totalY;
    if (mag2 >= 1.0) {
        const s = (1 / Math.sqrt(mag2)) * 0.999;
        return [totalX * s, totalY * s];
    }
    return [totalX, totalY];
}
/**
 * Generates a flat Float32Array-based material export suitable for
 * direct GPU buffer/texture upload. All fields are per-vertex, tightly packed.
 */
export function exportSkinMaterial(definition, canonical, preset = SkinPreset.Fair) {
    const presetProfile = SKIN_PRESETS[preset];
    const aging = computeAgingState(definition);
    const blemishes = generateBlemishes(canonical.vertices, definition);
    const wrinkleMaps = generateWrinkleMap(canonical.vertices, aging);
    const poreDetails = new Map();
    for (const v of canonical.vertices) {
        if (isSkinRegion(v.region)) {
            poreDetails.set(v.id, generatePoreDetail(v.id, v.uv, v.region));
        }
    }
    const blemishMap = new Map();
    for (const b of blemishes) {
        const list = blemishMap.get(b.vertexId);
        if (list)
            list.push(b);
        else
            blemishMap.set(b.vertexId, [b]);
    }
    const wrinkleMap = new Map();
    for (const w of wrinkleMaps) {
        wrinkleMap.set(w.vertexId, w);
    }
    const n = canonical.vertexCount;
    const baseColor = new Float32Array(n * 3);
    const roughness = new Float32Array(n);
    const specular = new Float32Array(n);
    const sssColor = new Float32Array(n * 3);
    const sssDepth = new Float32Array(n);
    const normalIntensity = new Float32Array(n);
    const poreDetail = new Float32Array(n);
    const wrinkleDepth = new Float32Array(n);
    const blemishMask = new Float32Array(n);
    const normalPerturbX = new Float32Array(n);
    const normalPerturbY = new Float32Array(n);
    const pigmentation = definition.get('skin.pigmentation');
    for (const v of canonical.vertices) {
        if (!isSkinRegion(v.region)) {
            continue;
        }
        const idx3 = v.id * 3;
        const regionMat = REGION_MATERIALS[v.region] ?? REGION_MATERIALS.torso;
        // Base color: preset base mixed with pigmentation
        const colorBlend = clamp(pigmentation, 0, 1);
        const baseCol = lerpColor(presetProfile.baseColor, [
            presetProfile.baseColor[0] * 0.7,
            presetProfile.baseColor[1] * 0.65,
            presetProfile.baseColor[2] * 0.6,
        ], colorBlend);
        // Apply residual-style age + pigment offsets
        const age = aging.age;
        const ageTerm = (age - 0.3) * 0.035 * (v.region === 'face' || v.region === 'nose' ? 1.25 : 0.7);
        const pigmentTerm = (pigmentation - 0.5) * 0.025;
        baseColor[idx3 + 0] = clamp(baseCol[0] + ageTerm + pigmentTerm, 0, 1);
        baseColor[idx3 + 1] = clamp(baseCol[1] + ageTerm * 0.55 + pigmentTerm * 0.6, 0, 1);
        baseColor[idx3 + 2] = clamp(baseCol[2] - ageTerm * 0.4 + pigmentTerm * 0.35, 0, 1);
        // Apply blemish color shifts
        const vBlemishes = blemishMap.get(v.id);
        if (vBlemishes) {
            for (const b of vBlemishes) {
                baseColor[idx3 + 0] = clamp(baseColor[idx3 + 0] + b.colorShift[0] * b.intensity, 0, 1);
                baseColor[idx3 + 1] = clamp(baseColor[idx3 + 1] + b.colorShift[1] * b.intensity, 0, 1);
                baseColor[idx3 + 2] = clamp(baseColor[idx3 + 2] + b.colorShift[2] * b.intensity, 0, 1);
                blemishMask[v.id] = clamp(blemishMask[v.id] + b.intensity, 0, 1);
            }
        }
        // Roughness: preset + region + age + wetness
        const wetness = definition.get('skin.wetness');
        roughness[v.id] = clamp(lerp(presetProfile.roughness, regionMat.roughness, 0.4) +
            aging.age * 0.04 * regionMat.wrinkleSusceptibility -
            wetness * 0.12, 0.1, 0.95);
        // Specular: preset + region
        specular[v.id] = clamp(lerp(presetProfile.specular, regionMat.specular, 0.5), 0.1, 0.8);
        // SSS
        const sss = computeSSSApproximation(v.id, v.region, aging, presetProfile);
        sssColor[idx3 + 0] = sss.color[0];
        sssColor[idx3 + 1] = sss.color[1];
        sssColor[idx3 + 2] = sss.color[2];
        sssDepth[v.id] = sss.depth;
        // Normal intensity
        const skinRoughness = definition.get('skin.roughness');
        normalIntensity[v.id] = clamp(0.15 + aging.age * 0.5 + skinRoughness * 0.25 + poreDetails.get(v.id).combined * 0.1, 0, 1);
        // Pore detail
        poreDetail[v.id] = poreDetails.get(v.id).combined;
        // Wrinkle depth
        const wr = wrinkleMap.get(v.id);
        wrinkleDepth[v.id] = wr ? wr.depth : 0;
        // Tangent-space normal perturbation (normal map proxy) from pore + wrinkle detail
        const poreComb = poreDetails.get(v.id).combined;
        const [npX, npY] = generateNormalPerturbation(v.id, v.uv, v.region, aging, poreComb, wrinkleDepth[v.id]);
        normalPerturbX[v.id] = npX;
        normalPerturbY[v.id] = npY;
    }
    return {
        vertexCount: n,
        baseColor,
        roughness,
        specular,
        sssColor,
        sssDepth,
        normalIntensity,
        poreDetail,
        wrinkleDepth,
        blemishMask,
        normalPerturbX,
        normalPerturbY,
    };
}
// â”€â”€â”€ Preset access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Returns the immutable preset profile for a given SkinPreset. */
export function getSkinPresetProfile(preset) {
    return SKIN_PRESETS[preset];
}
/** Returns the per-region material properties for a given region. */
export function getRegionSkinMaterial(region) {
    return REGION_MATERIALS[region] ?? REGION_MATERIALS.torso;
}
// â”€â”€â”€ Original API (preserved exactly) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Procedural neural-skin residual stand-in. It is deterministic, bounded, and
 * driven by semantic skin state so it can be replaced by a trained model later
 * without changing the public surface API.
 */
export function generateSkinResiduals(definition, canonical, options = {}) {
    const strength = clamp(options.strength ?? 1, 0, 1);
    const maxSamples = Math.max(0, Math.floor(options.maxSamples ?? canonical.vertexCount));
    const age = definition.get('skin.age') / 100;
    const pigmentation = definition.get('skin.pigmentation');
    const wetness = definition.get('skin.wetness');
    const roughness = definition.get('skin.roughness');
    const samples = [];
    for (const v of canonical.vertices) {
        if (samples.length >= maxSamples)
            break;
        if (!isSkinRegion(v.region))
            continue;
        const pores = noise(v.id, v.uv.u, v.uv.v);
        const freckles = noise(v.id * 17 + 3, v.position.x, v.position.y);
        const regionScale = v.region === 'face' || v.region === 'nose' ? 1.25 : 0.7;
        const ageTerm = (age - 0.3) * 0.035 * regionScale;
        const pigmentTerm = (pigmentation - 0.5) * 0.025;
        const poreTerm = (pores - 0.5) * 0.018 * regionScale;
        samples.push({
            vertexId: v.id,
            region: v.region,
            colorDelta: [
                clampDelta((ageTerm + pigmentTerm + poreTerm) * strength),
                clampDelta((ageTerm * 0.55 + pigmentTerm * 0.6 + (freckles - 0.5) * 0.014) * strength),
                clampDelta((-ageTerm * 0.4 + pigmentTerm * 0.35 + poreTerm * 0.45) * strength),
            ],
            roughnessDelta: clampDelta(((pores - 0.5) * 0.08 + age * 0.04 - wetness * 0.12) * strength),
            normalIntensity: clamp((0.15 + age * 0.5 + roughness * 0.25 + pores * 0.1) * strength, 0, 1),
        });
    }
    return { samples, strength };
}
export function applySkinResidualColor(base, residual) {
    return [
        clamp(base[0] + residual.colorDelta[0], 0, 1),
        clamp(base[1] + residual.colorDelta[1], 0, 1),
        clamp(base[2] + residual.colorDelta[2], 0, 1),
    ];
}
//# sourceMappingURL=neural-skin.js.map