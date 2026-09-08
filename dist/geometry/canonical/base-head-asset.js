/**
 * Scan-derived BASE HEAD ASSET ingestion (DAYTONA HD HEAD V0.1).
 *
 * The authored/procedural head is an implicit-surface sculpt. It can be made
 * clean, but it can never be *real*: it has no scan-derived facial topology, no
 * authored eyelid/lip/ear loops, and no measured identity space. That is the
 * actual ceiling we kept hitting — not shading.
 *
 * This module opens the seam for a real head: a neutral, engine-agnostic asset
 * format that a scan-derived head model (ICT-FaceKit, GNM, or any other) can be
 * baked into, plus a `CanonicalHumanProvider` that feeds it through the existing
 * canonical topology / validator / adapter path. Nothing else in the SDK changes:
 * HumanDefinition stays the source of truth, the dependency graph, delta
 * compiler, sparse morphs, identity preservation, event timeline, WebGPU
 * pipeline and WebGL2 fallback all keep driving the head exactly as before.
 *
 * ## Licensing is enforced here, on purpose
 *
 * Several of the best public head models are research-only, and their licenses
 * bind *derivatives* too — a head fitted to or sculpted from them inherits the
 * restriction. The SDK ships inside a public city kiosk, so the license of the
 * baked head is a shipping property of the build, not a footnote. Every asset
 * declares its license; `assetLicenseClass()` classifies it, and a provider
 * constructed with `requireShippable` (the default for production builds)
 * refuses to load anything that is not commercially redistributable. Research
 * assets remain fully loadable for evaluation and comparison with
 * `requireShippable: false`.
 */
import { validateCanonicalTopology } from './canonical-validator.js';
import { headRegionFor, headSkinWeights } from './hd-head-regions.js';
import { gateLandmarkProportions, } from '../reference/anthropometry.js';
/**
 * Known permissive licenses. Only these may be baked into a shipped build.
 * Compared case-insensitively against the asset's declared `license` SPDX-ish id.
 */
export const SHIPPABLE_LICENSES = Object.freeze([
    'mit',
    'apache-2.0',
    'apache2',
    'bsd-2-clause',
    'bsd-3-clause',
    'cc0-1.0',
    'cc-by-4.0',
    'unlicense',
    'zlib',
]);
/**
 * Licenses known to be research/non-commercial. Listed explicitly so the
 * classification is auditable rather than a silent fallthrough. These cover the
 * common public head-model terms (FLAME, SMPL-X, METHA, Universal_Head_3DMM,
 * Head360 and similar custom academic terms).
 */
export const RESEARCH_ONLY_LICENSES = Object.freeze([
    'cc-by-nc-4.0',
    'cc-by-nc-sa-4.0',
    'cc-by-nc-nd-4.0',
    'flame-license',
    'smplx-license',
    'metha-research',
    'academic-research-only',
    'non-commercial',
    'research-only',
    'custom-restricted',
]);
export function assetLicenseClass(license) {
    const id = license.trim().toLowerCase();
    if (SHIPPABLE_LICENSES.includes(id))
        return 'shippable';
    if (RESEARCH_ONLY_LICENSES.includes(id))
        return 'research_only';
    return 'unknown';
}
/** True only for licenses that may be redistributed in a commercial build. */
export function isShippableLicense(license) {
    return assetLicenseClass(license) === 'shippable';
}
const finite3 = (arr) => {
    for (let i = 0; i < arr.length; i++)
        if (!Number.isFinite(arr[i]))
            return false;
    return true;
};
/**
 * Structurally validate an asset and report everything a reviewer needs before
 * baking it: counts, bounds, license class, and whether it satisfies the
 * anthropometric canons. Never throws.
 */
export function inspectBaseHeadAsset(asset) {
    const issues = [];
    const vertexCount = Math.floor(asset.positions.length / 3);
    const triangleCount = Math.floor(asset.indices.length / 3);
    if (asset.positions.length === 0)
        issues.push({ code: 'empty', message: 'asset has no positions' });
    if (asset.positions.length % 3 !== 0)
        issues.push({ code: 'positions_stride', message: 'positions length is not a multiple of 3' });
    if (asset.indices.length % 3 !== 0)
        issues.push({ code: 'indices_stride', message: 'indices length is not a multiple of 3' });
    if (!finite3(asset.positions))
        issues.push({ code: 'positions_nonfinite', message: 'positions contain NaN/Infinity' });
    if (asset.normals && asset.normals.length !== vertexCount * 3)
        issues.push({ code: 'normals_count', message: 'normals count does not match vertex count' });
    if (asset.uvs && asset.uvs.length !== vertexCount * 2)
        issues.push({ code: 'uvs_count', message: 'uv count does not match vertex count' });
    if (asset.regions && asset.regions.length !== vertexCount)
        issues.push({ code: 'regions_count', message: 'region count does not match vertex count' });
    for (let i = 0; i < asset.indices.length; i++) {
        if (asset.indices[i] >= vertexCount) {
            issues.push({
                code: 'index_range',
                message: `index ${asset.indices[i]} exceeds vertex count`,
            });
            break;
        }
    }
    for (const lm of asset.landmarks ?? []) {
        if (lm.vertexIndex < 0 || lm.vertexIndex >= vertexCount) {
            issues.push({
                code: 'landmark_range',
                message: `landmark ${lm.name} references a missing vertex`,
            });
            break;
        }
    }
    for (const bs of asset.blendshapes ?? []) {
        if (bs.deltas.length !== bs.indices.length * 3) {
            issues.push({
                code: 'blendshape_stride',
                message: `blendshape ${bs.name} delta count mismatch`,
            });
            break;
        }
    }
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let v = 0; v < vertexCount; v++) {
        const x = asset.positions[v * 3];
        const y = asset.positions[v * 3 + 1];
        const z = asset.positions[v * 3 + 2];
        if (x < min.x)
            min.x = x;
        if (y < min.y)
            min.y = y;
        if (z < min.z)
            min.z = z;
        if (x > max.x)
            max.x = x;
        if (y > max.y)
            max.y = y;
        if (z > max.z)
            max.z = z;
    }
    const licenseClass = assetLicenseClass(asset.license);
    const proportions = asset.landmarks?.length ? measureAsset(asset) : null;
    return {
        vertexCount,
        triangleCount,
        licenseClass,
        shippable: licenseClass === 'shippable',
        hasUvs: !!asset.uvs,
        hasNormals: !!asset.normals,
        blendshapeCount: asset.blendshapes?.length ?? 0,
        landmarkCount: asset.landmarks?.length ?? 0,
        bounds: { min, max },
        proportions,
        issues,
        valid: issues.length === 0,
    };
}
/** Measure the asset's own landmarks against the anthropometry reference. */
export function measureAsset(asset) {
    const positions = {};
    for (const lm of asset.landmarks ?? []) {
        const i = lm.vertexIndex * 3;
        if (i + 2 >= asset.positions.length)
            continue;
        positions[lm.name] = [
            asset.positions[i],
            asset.positions[i + 1],
            asset.positions[i + 2],
        ];
    }
    return gateLandmarkProportions(positions);
}
/** Area-weighted vertex normals. Deterministic; used when the asset omits them. */
export function computeAssetNormals(positions, indices) {
    const out = new Float32Array(positions.length);
    for (let t = 0; t + 2 < indices.length; t += 3) {
        const a = indices[t] * 3;
        const b = indices[t + 1] * 3;
        const c = indices[t + 2] * 3;
        const e1x = positions[b] - positions[a];
        const e1y = positions[b + 1] - positions[a + 1];
        const e1z = positions[b + 2] - positions[a + 2];
        const e2x = positions[c] - positions[a];
        const e2y = positions[c + 1] - positions[a + 1];
        const e2z = positions[c + 2] - positions[a + 2];
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        for (const base of [a, b, c]) {
            out[base] += nx;
            out[base + 1] += ny;
            out[base + 2] += nz;
        }
    }
    for (let i = 0; i < out.length; i += 3) {
        const len = Math.hypot(out[i], out[i + 1], out[i + 2]);
        if (len > 1e-12) {
            out[i] /= len;
            out[i + 1] /= len;
            out[i + 2] /= len;
        }
        else {
            out[i + 1] = 1;
        }
    }
    return out;
}
export class BaseHeadLicenseError extends Error {
    assetName;
    license;
    licenseClass;
    constructor(assetName, license, licenseClass) {
        super(`Base head "${assetName}" is licensed "${license}" (${licenseClass}) and cannot be baked into a ` +
            `redistributable build. Its terms bind derivative geometry as well as the original files. ` +
            `Use a permissively licensed head (see SHIPPABLE_LICENSES), or construct the provider with ` +
            `requireShippable: false for evaluation only.`);
        this.assetName = assetName;
        this.license = license;
        this.licenseClass = licenseClass;
        this.name = 'BaseHeadLicenseError';
    }
}
/**
 * Feeds a scan-derived base head through the canonical provider seam, so the
 * runtime consumes a real head exactly as it consumes the procedural one.
 */
export class BaseHeadProvider {
    asset;
    version = 'DaytonaCanonicalHuman v0.1';
    headBone;
    neckBone;
    requireShippable;
    requireProportions;
    constructor(asset, opts = {}) {
        this.asset = asset;
        this.headBone = opts.headBone ?? 'head';
        this.neckBone = opts.neckBone ?? 'neck';
        this.requireShippable = opts.requireShippable ?? true;
        this.requireProportions = opts.requireProportions ?? false;
    }
    /** Full structural / license / proportion report without building geometry. */
    inspect() {
        return inspectBaseHeadAsset(this.asset);
    }
    build() {
        const inspection = inspectBaseHeadAsset(this.asset);
        if (!inspection.valid) {
            throw new Error(`Base head "${this.asset.name}" is structurally invalid: ` +
                inspection.issues.map((i) => `${i.code}: ${i.message}`).join('; '));
        }
        if (this.requireShippable && !inspection.shippable) {
            throw new BaseHeadLicenseError(this.asset.name, this.asset.license, inspection.licenseClass);
        }
        if (this.requireProportions && inspection.proportions && !inspection.proportions.pass) {
            throw new Error(`Base head "${this.asset.name}" fails the anthropometric canons: ` +
                inspection.proportions.failures.map((f) => f.canon.id).join(', '));
        }
        const { positions, indices } = this.asset;
        const normals = this.asset.normals ?? computeAssetNormals(positions, indices);
        const uvs = this.asset.uvs;
        const vertexCount = inspection.vertexCount;
        const vertices = new Array(vertexCount);
        for (let v = 0; v < vertexCount; v++) {
            const x = positions[v * 3];
            const y = positions[v * 3 + 1];
            const z = positions[v * 3 + 2];
            const region = this.asset.regions?.[v] ?? headRegionFor(y, x, z);
            vertices[v] = {
                id: v,
                position: { x, y, z },
                normal: { x: normals[v * 3], y: normals[v * 3 + 1], z: normals[v * 3 + 2] },
                uv: uvs ? { u: uvs[v * 2], v: uvs[v * 2 + 1] } : { u: 0, v: 0 },
                region,
                weights: headSkinWeights(region, this.headBone, this.neckBone),
            };
        }
        const parts = [
            {
                name: 'base_head_skin',
                kind: 'skin',
                region: 'head',
                vertexStart: 0,
                vertexCount,
                indexStart: 0,
                indexCount: indices.length,
            },
        ];
        const topology = { vertices, indices, parts };
        return {
            version: this.version,
            topology,
            landmarks: this.surfaceLandmarks(indices, vertexCount),
            metadata: {
                author: this.asset.name,
                note: `scan-derived base head; source=${this.asset.source}; license=${this.asset.license} ` +
                    `(${inspection.licenseClass}); revision=${this.asset.revision}`,
            },
        };
    }
    /**
     * Convert vertex-index landmarks into the SDK's surface-relative form (triangle
     * + barycentric + normal offset) so they survive deformation.
     */
    surfaceLandmarks(indices, vertexCount) {
        const firstTriangleFor = new Int32Array(vertexCount).fill(-1);
        const cornerFor = new Int8Array(vertexCount);
        for (let t = 0; t + 2 < indices.length; t += 3) {
            for (let c = 0; c < 3; c++) {
                const v = indices[t + c];
                if (firstTriangleFor[v] === -1) {
                    firstTriangleFor[v] = t / 3;
                    cornerFor[v] = c;
                }
            }
        }
        const out = [];
        let id = 0;
        for (const lm of this.asset.landmarks ?? []) {
            const tri = firstTriangleFor[lm.vertexIndex];
            if (tri === -1)
                continue;
            const bary = [0, 0, 0];
            bary[cornerFor[lm.vertexIndex]] = 1;
            out.push({ id: id++, name: lm.name, triangleId: tri, barycentric: bary, normalOffset: 0 });
        }
        return out;
    }
    /** Blendshapes carried by the asset, for the sparse morph pipeline. */
    blendshapes() {
        return this.asset.blendshapes ?? [];
    }
    async load() {
        return this.build();
    }
    validate() {
        const inspection = inspectBaseHeadAsset(this.asset);
        if (!inspection.valid) {
            return {
                valid: false,
                report: null,
                issues: inspection.issues.map((i) => ({ code: i.code, message: i.message })),
            };
        }
        const report = validateCanonicalTopology(this.build().topology);
        return { valid: report.valid, report, issues: report.issues };
    }
    topologyVersion() {
        return `base-head-${this.asset.revision}`;
    }
}
//# sourceMappingURL=base-head-asset.js.map