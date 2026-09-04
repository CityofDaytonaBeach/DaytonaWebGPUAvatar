import { CanonicalHuman } from './canonical-human.js';
import { buildRegionRanges } from './regions.js';
import { validateCanonicalTopology } from './canonical-validator.js';
export class CanonicalTopologyAdapter {
    name = 'CanonicalTopologyAdapter';
    accepts(asset) {
        if (!asset || typeof asset !== 'object')
            return false;
        const candidate = asset;
        return (Array.isArray(candidate.vertices) &&
            candidate.indices instanceof Uint32Array &&
            Array.isArray(candidate.parts));
    }
    resolve(asset, boneNames) {
        if (!this.accepts(asset))
            throw new TypeError(`${this.name}: asset does not match CanonicalTopology`);
        const parts = asset.parts.map((part) => ({
            name: part.name,
            kind: part.kind,
            region: part.region,
            vertexStart: part.vertexStart,
            vertexCount: part.vertexCount,
            indexStart: part.indexStart,
            indexCount: part.indexCount,
        }));
        const canonical = new CanonicalHuman([...boneNames]);
        return CanonicalTopologyAdapter.overlay(canonical, asset.vertices, asset.indices, parts);
    }
    static overlay(canonical, vertices, indices, parts) {
        canonical.vertices = Array.from(vertices);
        canonical.indices = indices;
        canonical.parts = parts;
        const regions = buildRegionRanges(vertices);
        canonical.regionRanges = regions;
        const partByRegion = new Map();
        for (const part of parts)
            partByRegion.set(part.region, part);
        canonical.partByRegion = partByRegion;
        for (const part of parts) {
            canonical.partIndexRanges.set(part.name, {
                start: part.indexStart,
                count: part.indexCount,
            });
        }
        return canonical;
    }
}
export function adaptCanonicalTopologyAsset(asset, boneNames, adapter = new CanonicalTopologyAdapter()) {
    if (!adapter.accepts(asset)) {
        return {
            ok: false,
            canonical: null,
            report: {
                vertexCount: 0,
                partCount: 0,
                issues: [
                    { code: 'archetype-mismatch', message: `${adapter.name} does not accept this asset` },
                ],
            },
        };
    }
    const topology = asset;
    const validation = validateCanonicalTopology(topology);
    if (!validation.valid) {
        return {
            ok: false,
            canonical: null,
            report: {
                vertexCount: validation.vertexCount,
                partCount: validation.partCount,
                issues: validation.issues,
            },
        };
    }
    const canonical = adapter.resolve(topology, boneNames);
    return {
        ok: true,
        canonical,
        report: { vertexCount: canonical.vertexCount, partCount: canonical.parts.length, issues: [] },
    };
}
//# sourceMappingURL=canonical-adapter.js.map