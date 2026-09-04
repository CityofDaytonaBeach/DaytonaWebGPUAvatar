import { HumanDefinition } from '../../core/schema/human-definition.js';
/** Deterministic JSON package for persisted HDL state. */
export interface HumanPackageHeader {
    magic: string;
    version: string;
    schemaVersion: string;
    topologyRef: string;
}
export interface HumanPackageDocument {
    header: HumanPackageHeader;
    definition: Record<string, number>;
}
export interface HumanPackageMigration {
    from: string;
    to: string;
    migrate: (definition: Record<string, number>) => Record<string, number>;
}
export declare const PACKAGE_MAGIC = "DHAV";
export declare const PACKAGE_VERSION = "0.2.0";
export declare const DEFAULT_TOPOLOGY_REF = "canonical-block-human-v0.2";
export declare const DEFAULT_SCHEMA_VERSION = "1.0";
export declare const DEFAULT_PACKAGE_MIGRATIONS: HumanPackageMigration[];
/** Serialize a HumanDefinition into a JSON document (lossless, deterministic). */
export declare function serializeDefinition(definition: HumanDefinition, topologyRef?: string): string;
export declare function createHumanPackageDocument(definition: HumanDefinition, topologyRef?: string): HumanPackageDocument;
export declare function migrateHumanPackageDocument(document: HumanPackageDocument, targetSchemaVersion: string, migrations?: readonly HumanPackageMigration[]): HumanPackageDocument;
/** Deserialize a JSON document back into values for a HumanDefinition. */
export declare function deserializeDocument(text: string, definition: HumanDefinition): {
    version: string;
    identity: Record<string, number>;
};
//# sourceMappingURL=human-package.d.ts.map