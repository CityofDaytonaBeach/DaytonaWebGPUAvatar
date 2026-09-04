import { buildBoneMatrices, combinedSkinMatrices } from '../anatomy/skeleton/bone-matrix.js';
import { vec3 } from '../core/math/vec.js';
export class AttachmentSystem {
    byId = new Map();
    add(attachment) {
        if (!attachment.id)
            throw new Error('Attachment id is required');
        if (!attachment.anchor.region && !attachment.anchor.bone) {
            throw new Error('Attachment anchor requires a region or bone');
        }
        this.byId.set(attachment.id, cloneAttachment(attachment));
    }
    remove(id) {
        return this.byId.delete(id);
    }
    get(id) {
        const attachment = this.byId.get(id);
        return attachment ? cloneAttachment(attachment) : null;
    }
    list() {
        return [...this.byId.values()].map(cloneAttachment);
    }
    clear() {
        this.byId.clear();
    }
    rebuild(events) {
        this.clear();
        for (const event of events)
            this.applyEvent(event);
    }
    applyEvent(event) {
        if (event.type === 'wear' || event.type === 'addTattoo') {
            const attachment = event.payload?.attachment;
            if (attachment)
                this.add(attachment);
        }
        if (event.type === 'removeAttachment' && typeof event.payload?.id === 'string') {
            this.remove(event.payload.id);
        }
    }
    resolve(attachment, canonical, skeleton, poses = [], morphDelta) {
        const offset = attachment.anchor.localPosition ?? vec3();
        if (attachment.anchor.bone) {
            return transformBoneLocal(attachment.anchor.bone, offset, skeleton, poses);
        }
        const region = attachment.anchor.region;
        if (!region)
            return offset;
        const base = regionCentroid(canonical, region, morphDelta);
        const skinned = transformByDominantRegionBone(base, canonical, region, skeleton, poses);
        return vec3(skinned.x + offset.x, skinned.y + offset.y, skinned.z + offset.z);
    }
}
function cloneAttachment(attachment) {
    return {
        id: attachment.id,
        kind: attachment.kind,
        anchor: {
            region: attachment.anchor.region,
            bone: attachment.anchor.bone,
            localPosition: attachment.anchor.localPosition
                ? { ...attachment.anchor.localPosition }
                : undefined,
        },
        data: attachment.data ? { ...attachment.data } : undefined,
    };
}
function regionCentroid(canonical, region, morphDelta) {
    let x = 0, y = 0, z = 0, count = 0;
    for (const v of canonical.vertices) {
        if (v.region !== region)
            continue;
        const i = v.id * 3;
        x += v.position.x + (morphDelta?.[i] ?? 0);
        y += v.position.y + (morphDelta?.[i + 1] ?? 0);
        z += v.position.z + (morphDelta?.[i + 2] ?? 0);
        count++;
    }
    if (count === 0)
        throw new Error(`Unknown attachment region: ${region}`);
    return vec3(x / count, y / count, z / count);
}
function transformBoneLocal(bone, local, skeleton, poses) {
    const index = skeleton.findIndex((b) => b.name === bone);
    if (index < 0)
        throw new Error(`Unknown attachment bone: ${bone}`);
    const current = buildBoneMatrices(skeleton, poses).current.subarray(index * 16, index * 16 + 16);
    return transformPoint(current, local);
}
function transformByDominantRegionBone(p, canonical, region, skeleton, poses) {
    const bone = dominantRegionBone(canonical, region);
    const index = skeleton.findIndex((b) => b.name === bone);
    if (index < 0)
        return p;
    const skin = combinedSkinMatrices(skeleton, poses).subarray(index * 16, index * 16 + 16);
    return transformPoint(skin, p);
}
function dominantRegionBone(canonical, region) {
    const totals = new Map();
    for (const v of canonical.vertices) {
        if (v.region !== region)
            continue;
        for (const [bone, weight] of Object.entries(v.weights)) {
            totals.set(bone, (totals.get(bone) ?? 0) + weight);
        }
    }
    let best = null;
    let bestWeight = -Infinity;
    for (const [bone, weight] of totals) {
        if (weight > bestWeight) {
            best = bone;
            bestWeight = weight;
        }
    }
    return best;
}
function transformPoint(m, p) {
    return vec3(m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12], m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13], m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]);
}
//# sourceMappingURL=attachment-system.js.map