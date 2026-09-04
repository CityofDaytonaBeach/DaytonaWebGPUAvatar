const EPS = 1e-4;
function normWeights(w) {
    const entries = Object.entries(w).filter(([, v]) => Math.abs(v) > EPS);
    const sum = entries.reduce((a, [, v]) => a + v, 0);
    if (sum <= EPS)
        return {};
    const out = {};
    for (const [k, v] of entries)
        out[k] = v / sum;
    return out;
}
/** Linearly blend per-bone weights across a vertical (y) range. */
function blendBones(y, yLo, bLo, yHi, bHi) {
    const t = yHi - yLo <= EPS ? 0 : Math.min(1, Math.max(0, (y - yLo) / (yHi - yLo)));
    return normWeights({ [bLo]: 1 - t, [bHi]: t });
}
/** Build a column of k ring rows × segments cols as a quad strip. */
function column(offsetX, rings, segments) {
    const vertices = [];
    for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        for (let j = 0; j < segments; j++) {
            const a = (j / segments) * Math.PI * 2;
            const x = offsetX + ring.rx * Math.cos(a);
            const z = ring.cz + ring.rz * Math.sin(a);
            const y = ring.y;
            vertices.push({
                id: -1,
                position: { x, y, z },
                normal: { x: Math.cos(a), y: 0, z: Math.sin(a) },
                uv: { u: j / segments, v: i / (rings.length - 1 || 1) },
                region: ring.region,
                weights: { ...ring.weights },
            });
        }
    }
    const quad = [];
    const W = segments;
    for (let i = 0; i < rings.length - 1; i++) {
        for (let j = 0; j < W; j++) {
            const a = i * W + j;
            const b = i * W + ((j + 1) % W);
            const c = (i + 1) * W + j;
            const d = (i + 1) * W + ((j + 1) % W);
            quad.push([a, c, b, b, c, d]);
        }
    }
    return { vertices, quad };
}
/** A single ring row with region + weights. */
function ring(y, rx, rz, cz, region, weights) {
    return { y, rx, rz, cz, region, weights };
}
/** Weight by absolute bone dominance (single-bone regions). */
function boneOnly(name) {
    return { [name]: 1 };
}
/**
 * Compose a full-body skin: torso + pelvis, two arms, two legs, two feet.
 * Returns flat vertex/index arrays ready to append to the canonical topology.
 */
export function buildHdBodySkin(opts = {}) {
    const neckY = opts.neckY ?? 1.68;
    const S = opts.segments ?? 20;
    // ------------------------------------------------------------------ torso
    const torso = [
        ring(neckY, 0.115, 0.1, 0, 'chest', { chest: 1 }),
        ring(1.58, 0.115, 0.1, 0, 'chest', { chest: 1 }),
        ring(1.5, 0.112, 0.098, 0, 'chest', { chest: 1 }),
        ring(1.38, 0.11, 0.095, 0, 'chest', { chest: 1 }),
        ring(1.28, 0.108, 0.09, 0, 'abdomen', { spine_02: 1 }),
        ring(1.18, 0.105, 0.088, 0, 'abdomen', { spine_02: 1 }),
        ring(1.08, 0.106, 0.09, 0, 'abdomen', { spine_01: 1 }),
        ring(0.99, 0.112, 0.096, 0, 'pelvis', { pelvis: 1 }),
        ring(0.932, 0.118, 0.1, 0, 'pelvis', { pelvis: 1 }),
    ];
    let torsoCol = column(0, torso, S);
    // Re-tag torso rings into more specific regions and blended weights.
    const retagTorso = () => {
        const W = S;
        const rows = torso.length;
        for (let i = 0; i < rows; i++) {
            const spec = torso[i];
            const isPelvis = spec.region === 'pelvis';
            const isAbdomen = spec.region === 'abdomen';
            for (let j = 0; j < W; j++) {
                const vi = i * W + j;
                const v = torsoCol.vertices[vi];
                const p = v.position;
                const lateral = Math.abs(p.x);
                // Side bands (high |x|) at shoulder height → shoulder_l/r.
                if (p.y >= 1.5 && lateral > spec.rx * 0.72) {
                    torsoCol.vertices[vi] = {
                        ...v,
                        region: p.x < 0 ? 'shoulder_left' : 'shoulder_right',
                        weights: blendBones(p.y, 1.5, 'chest', 1.64, p.x < 0 ? 'clavicle_l' : 'clavicle_r'),
                    };
                }
                else if (isAbdomen || isPelvis || spec.region === 'chest') {
                    // Keep central band; split chest front from back, but preserve a 'back'
                    // band on the rear of the abdomen/pelvis.
                    let region = spec.region;
                    let weights = { ...v.weights };
                    if (p.z < 0 && (isAbdomen || isPelvis)) {
                        region = 'back';
                        weights = isPelvis ? { pelvis: 1 } : { spine_01: 1 };
                    }
                    else if (spec.region === 'chest' && p.z < 0) {
                        region = 'back';
                        weights = { spine_02: 0.5, chest: 0.5 };
                    }
                    torsoCol.vertices[vi] = { ...v, region, weights };
                }
            }
        }
    };
    retagTorso();
    // ------------------------------------------------------------------ arms
    const buildArm = (side) => {
        const l = side < 0;
        const prefix = (n) => n + (l ? '_l' : '_r');
        const ox = side * 0.215;
        const armRings = [
            ring(1.5, 0.048, 0.052, 0, l ? 'upper_arm_left' : 'upper_arm_right', boneOnly(prefix('upperarm'))),
            ring(1.4, 0.047, 0.05, 0, l ? 'upper_arm_left' : 'upper_arm_right', boneOnly(prefix('upperarm'))),
            ring(1.26, 0.045, 0.048, 0, l ? 'upper_arm_left' : 'upper_arm_right', normWeights({ [prefix('upperarm')]: 0.8, [prefix('forearm')]: 0.2 })),
            ring(1.12, 0.04, 0.042, 0, l ? 'forearm_left' : 'forearm_right', boneOnly(prefix('forearm'))),
            ring(0.98, 0.036, 0.038, 0, l ? 'forearm_left' : 'forearm_right', boneOnly(prefix('forearm'))),
            ring(0.9, 0.035, 0.037, 0, l ? 'hand_left' : 'hand_right', boneOnly(prefix('hand'))),
        ];
        const c = column(ox, armRings, S);
        // Blend the top ring into the shoulder (clavicle + upperarm).
        for (let j = 0; j < S; j++) {
            const vi = j;
            c.vertices[vi] = {
                ...c.vertices[vi],
                weights: normWeights({ [prefix('upperarm')]: 0.7, [prefix('clavicle')]: 0.3 }),
            };
        }
        return c;
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);
    // ------------------------------------------------------------------ legs
    const buildLeg = (side) => {
        const l = side < 0;
        const prefix = (n) => n + (l ? '_l' : '_r');
        const ox = side * 0.075;
        const legRings = [
            ring(1.0, 0.062, 0.07, 0, l ? 'thigh_left' : 'thigh_right', boneOnly(prefix('thigh'))),
            ring(0.86, 0.058, 0.066, 0, l ? 'thigh_left' : 'thigh_right', boneOnly(prefix('thigh'))),
            ring(0.7, 0.052, 0.06, 0, l ? 'thigh_left' : 'thigh_right', normWeights({ [prefix('thigh')]: 0.6, [prefix('shin')]: 0.4 })),
            ring(0.5, 0.042, 0.048, 0, l ? 'shin_left' : 'shin_right', boneOnly(prefix('shin'))),
            ring(0.32, 0.036, 0.042, 0, l ? 'shin_left' : 'shin_right', boneOnly(prefix('shin'))),
            ring(0.16, 0.032, 0.04, 0, l ? 'shin_left' : 'shin_right', boneOnly(prefix('shin'))),
        ];
        const c = column(ox, legRings, S);
        // Top thigh ring blends toward pelvis.
        for (let j = 0; j < S; j++) {
            c.vertices[j] = {
                ...c.vertices[j],
                weights: normWeights({ [prefix('thigh')]: 0.85, pelvis: 0.15 }),
            };
        }
        return c;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);
    // ------------------------------------------------------------------ feet
    const buildFoot = (side) => {
        const l = side < 0;
        const prefix = (n) => n + (l ? '_l' : '_r');
        const ringR = 0.05;
        const feetCol = (ox) => column(ox, [
            ring(0.16, ringR, ringR, 0.06, l ? 'foot_left' : 'foot_right', boneOnly(prefix('foot'))),
            ring(0.06, ringR * 1.05, ringR * 1.05, 0.06, l ? 'foot_left' : 'foot_right', boneOnly(prefix('foot'))),
            ring(0.02, ringR * 1.1, ringR * 1.4, 0.1, l ? 'foot_left' : 'foot_right', boneOnly(prefix('foot'))),
        ], S);
        const c = feetCol(side * 0.075);
        // Blend ankle into foot.
        for (let j = 0; j < S; j++) {
            c.vertices[j] = {
                ...c.vertices[j],
                weights: normWeights({ [prefix('foot')]: 0.85, [prefix('shin')]: 0.15 }),
            };
        }
        return c;
    };
    const footL = buildFoot(-1);
    const footR = buildFoot(1);
    // ------------------------------------------------------------------ merge
    const allRings = [torsoCol, armL, armR, legL, legR, footL, footR];
    const vertices = [];
    const indices = [];
    let base = 0;
    for (const part of allRings) {
        for (const v of part.vertices)
            vertices.push({ ...v });
        for (const [a, c, b, b2, c2, d] of part.quad) {
            indices.push(base + a, base + c, base + b, base + b2, base + c2, base + d);
        }
        base += part.vertices.length;
    }
    return { vertices, indices: Uint32Array.from(indices) };
}
//# sourceMappingURL=hd-body-skin.js.map