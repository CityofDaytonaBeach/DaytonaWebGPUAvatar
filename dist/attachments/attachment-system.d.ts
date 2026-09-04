import { BoneDef } from '../anatomy/skeleton/skeleton.js';
import { BonePose } from '../animation/skeleton/skeletal-animation.js';
import { CharacterEvent } from '../core/events/character-event.js';
import { Vec3 } from '../core/math/vec.js';
import { CanonicalHuman, RegionName } from '../geometry/canonical/canonical-human.js';
export type AttachmentKind = 'wearable' | 'tattoo' | 'piercing' | 'generic';
export interface AttachmentAnchor {
    /** Semantic surface/region anchor; survives topology-preserving edits. */
    region?: RegionName;
    /** Bone-space anchor for objects that should follow articulation directly. */
    bone?: string;
    /** Local offset in meters from the resolved region centroid or bone origin. */
    localPosition?: Vec3;
}
export interface HumanAttachment {
    id: string;
    kind: AttachmentKind;
    anchor: AttachmentAnchor;
    data?: Record<string, unknown>;
}
export declare class AttachmentSystem {
    private readonly byId;
    add(attachment: HumanAttachment): void;
    remove(id: string): boolean;
    get(id: string): HumanAttachment | null;
    list(): HumanAttachment[];
    clear(): void;
    rebuild(events: ReadonlyArray<CharacterEvent>): void;
    applyEvent(event: CharacterEvent): void;
    resolve(attachment: HumanAttachment, canonical: CanonicalHuman, skeleton: BoneDef[], poses?: BonePose[], morphDelta?: Float32Array): Vec3;
}
//# sourceMappingURL=attachment-system.d.ts.map