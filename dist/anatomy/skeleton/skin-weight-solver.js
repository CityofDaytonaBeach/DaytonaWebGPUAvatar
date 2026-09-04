import { boneWorldPositions } from './skeleton-adaptation.js';
/** Semantic region -> the bone that must dominate vertices in that region. */
export const REGION_BONE_PRIOR = {
    head: 'head',
    face: 'head',
    forehead: 'head',
    temple_left: 'head',
    temple_right: 'head',
    nose: 'head',
    nose_bridge: 'head',
    nose_tip: 'head',
    nose_alar_left: 'head',
    nose_alar_right: 'head',
    eyes: 'head',
    eye_left: 'head',
    eye_right: 'head',
    eye_sclera: 'head',
    eye_iris: 'head',
    cornea: 'head',
    upper_eyelid_left: 'head',
    lower_eyelid_left: 'head',
    upper_eyelid_right: 'head',
    lower_eyelid_right: 'head',
    cheek_left: 'head',
    cheek_right: 'head',
    ear_left: 'head',
    ear_right: 'head',
    mouth: 'head',
    upper_lip: 'head',
    mouth_corner_left: 'head',
    mouth_corner_right: 'head',
    mouth_cavity: 'head',
    jaw: 'jaw',
    jaw_left: 'jaw',
    jaw_right: 'jaw',
    chin: 'jaw',
    lower_lip: 'jaw',
    teeth: 'jaw',
    tongue: 'jaw',
    neck: 'neck',
    torso: 'chest',
    chest: 'chest',
    back: 'chest',
    abdomen: 'spine_01',
    pelvis: 'pelvis',
    shoulder_left: 'clavicle_l',
    shoulder_right: 'clavicle_r',
    upperarm_l: 'upperarm_l',
    upperarm_r: 'upperarm_r',
    upper_arm_left: 'upperarm_l',
    upper_arm_right: 'upperarm_r',
    forearm_l: 'forearm_l',
    forearm_r: 'forearm_r',
    forearm_left: 'forearm_l',
    forearm_right: 'forearm_r',
    hand_l: 'hand_l',
    hand_r: 'hand_r',
    hand_left: 'hand_l',
    hand_right: 'hand_r',
    thigh_l: 'thigh_l',
    thigh_r: 'thigh_r',
    thigh_left: 'thigh_l',
    thigh_right: 'thigh_r',
    shin_l: 'shin_l',
    shin_r: 'shin_r',
    shin_left: 'shin_l',
    shin_right: 'shin_r',
    foot_left: 'foot_l',
    foot_right: 'foot_r',
};
const EPS = 1e-9;
/**
 * Bone segments for weighting: each bone owns the segment(s) reaching to its
 * children; leaf bones get a short stub continuing the parent direction so
 * hands/feet/jaw still capture their own vertices.
 */
export function buildBoneSegments(bones) {
    const world = boneWorldPositions(bones);
    const childrenOf = new Map();
    for (const b of bones) {
        if (!b.parent)
            continue;
        const list = childrenOf.get(b.parent) ?? [];
        list.push(b.name);
        childrenOf.set(b.parent, list);
    }
    const segments = [];
    for (const bone of bones) {
        const a = world.get(bone.name);
        const children = childrenOf.get(bone.name) ?? [];
        if (children.length > 0) {
            for (const child of children) {
                const b = world.get(child);
                segments.push({ bone: bone.name, a, b, length: distance(a, b) });
            }
            continue;
        }
        // Leaf: extend along the incoming direction.
        const parent = bone.parent ? world.get(bone.parent) : null;
        const dir = parent
            ? { x: a.x - parent.x, y: a.y - parent.y, z: a.z - parent.z }
            : { x: 0, y: -0.1, z: 0 };
        const len = Math.max(0.02, Math.hypot(dir.x, dir.y, dir.z) * 0.35);
        const n = normalize(dir);
        const b = { x: a.x + n.x * len, y: a.y + n.y * len, z: a.z + n.z * len };
        segments.push({ bone: bone.name, a, b, length: len });
    }
    return segments;
}
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function normalize(v) {
    const l = Math.hypot(v.x, v.y, v.z);
    if (l < EPS)
        return { x: 0, y: -1, z: 0 };
    return { x: v.x / l, y: v.y / l, z: v.z / l };
}
/** Shortest distance from a point to a finite segment. */
export function distanceToSegment(p, s) {
    const abx = s.b.x - s.a.x;
    const aby = s.b.y - s.a.y;
    const abz = s.b.z - s.a.z;
    const denom = abx * abx + aby * aby + abz * abz;
    if (denom < EPS)
        return distance(p, s.a);
    let t = ((p.x - s.a.x) * abx + (p.y - s.a.y) * aby + (p.z - s.a.z) * abz) / denom;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (s.a.x + abx * t), p.y - (s.a.y + aby * t), p.z - (s.a.z + abz * t));
}
/**
 * Solve skin weights for a deformed mesh against an adapted skeleton.
 *
 * `positions` defaults to the mesh's own base positions; pass deformed
 * positions when rebinding after a shape-space evaluation.
 */
export function solveSkinWeights(mesh, bones, positions, options = {}) {
    const maxInfluences = Math.max(1, options.maxInfluences ?? 4);
    const falloff = options.falloff ?? 4;
    const regionBoost = options.regionBoost ?? 6;
    const pruneBelow = options.pruneBelow ?? 0.02;
    const pos = positions ?? mesh.baseGeometry().positions;
    const segments = buildBoneSegments(bones);
    const weights = new Map();
    const bonesUsed = new Set();
    let influenceTotal = 0;
    let unweighted = 0;
    let sumErrors = 0;
    let regionPinned = 0;
    for (const vertex of mesh.vertices) {
        const p = {
            x: pos[vertex.id * 3],
            y: pos[vertex.id * 3 + 1],
            z: pos[vertex.id * 3 + 2],
        };
        const prior = REGION_BONE_PRIOR[vertex.region] ?? null;
        // Raw inverse-distance score per bone (best segment of that bone wins).
        const raw = new Map();
        for (const seg of segments) {
            const d = distanceToSegment(p, seg);
            const score = 1 / (Math.pow(d, falloff) + 1e-6);
            const previous = raw.get(seg.bone);
            if (previous === undefined || score > previous)
                raw.set(seg.bone, score);
        }
        if (prior) {
            const boosted = (raw.get(prior) ?? 0) * regionBoost;
            raw.set(prior, boosted > 0 ? boosted : 1);
            regionPinned += 1;
        }
        // Deterministic ordering: score desc, then declaration order.
        const order = new Map();
        bones.forEach((b, i) => order.set(b.name, i));
        const ranked = [...raw.entries()].sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0));
        const top = ranked.slice(0, maxInfluences);
        let total = top.reduce((acc, [, w]) => acc + w, 0);
        if (total <= EPS) {
            const fallback = prior ?? bones[0].name;
            weights.set(vertex.id, { [fallback]: 1 });
            bonesUsed.add(fallback);
            influenceTotal += 1;
            unweighted += 1;
            continue;
        }
        // Prune negligible influences, then renormalize.
        const kept = top.filter(([, w]) => w / total >= pruneBelow);
        const finalList = kept.length > 0 ? kept : top;
        total = finalList.reduce((acc, [, w]) => acc + w, 0);
        const record = {};
        let check = 0;
        for (const [bone, w] of finalList) {
            const value = w / total;
            record[bone] = value;
            check += value;
            bonesUsed.add(bone);
        }
        if (Math.abs(check - 1) > 1e-6)
            sumErrors += 1;
        influenceTotal += finalList.length;
        weights.set(vertex.id, record);
    }
    return {
        weights,
        report: {
            vertices: mesh.vertices.length,
            bonesUsed: bonesUsed.size,
            maxInfluences,
            meanInfluences: mesh.vertices.length > 0 ? influenceTotal / mesh.vertices.length : 0,
            unweightedVertices: unweighted,
            weightSumErrors: sumErrors,
            regionPinnedVertices: regionPinned,
        },
    };
}
/** Write solved weights onto the mesh vertices (in place). Returns count. */
export function applySkinWeights(mesh, weights) {
    let applied = 0;
    for (const vertex of mesh.vertices) {
        const w = weights.get(vertex.id);
        if (!w)
            continue;
        vertex.weights = { ...w };
        applied += 1;
    }
    return applied;
}
/** Validate a weight set against a skeleton (used by tests and diagnostics). */
export function validateSkinWeights(mesh, bones, weights, maxInfluences = 4) {
    const known = new Set(bones.map((b) => b.name));
    const unknown = new Set();
    let overBudget = 0;
    let badSum = 0;
    let missing = 0;
    for (const vertex of mesh.vertices) {
        const w = weights.get(vertex.id);
        if (!w) {
            missing += 1;
            continue;
        }
        const entries = Object.entries(w);
        if (entries.length > maxInfluences)
            overBudget += 1;
        let sum = 0;
        for (const [bone, value] of entries) {
            if (!known.has(bone))
                unknown.add(bone);
            sum += value;
        }
        if (Math.abs(sum - 1) > 1e-6)
            badSum += 1;
    }
    const issues = [];
    if (missing > 0)
        issues.push(`${missing} vertices have no weights`);
    if (overBudget > 0)
        issues.push(`${overBudget} vertices exceed ${maxInfluences} influences`);
    if (badSum > 0)
        issues.push(`${badSum} vertices do not sum to 1`);
    if (unknown.size > 0)
        issues.push(`unknown bones: ${[...unknown].sort().join(', ')}`);
    return {
        ok: issues.length === 0,
        issues,
        unknownBones: [...unknown].sort(),
        overBudgetVertices: overBudget,
        badSumVertices: badSum,
        missingVertices: missing,
    };
}
//# sourceMappingURL=skin-weight-solver.js.map