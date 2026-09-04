export const PACKAGE_MAGIC = 'DHAV';
export const PACKAGE_VERSION = '0.2.0';
export const DEFAULT_TOPOLOGY_REF = 'canonical-block-human-v0.2';
export const DEFAULT_SCHEMA_VERSION = '1.0';
export const DEFAULT_PACKAGE_MIGRATIONS = [
    { from: '0.1', to: DEFAULT_SCHEMA_VERSION, migrate: renameLegacyDefinitionKeys },
];
/** Serialize a HumanDefinition into a JSON document (lossless, deterministic). */
export function serializeDefinition(definition, topologyRef = DEFAULT_TOPOLOGY_REF) {
    return JSON.stringify(createHumanPackageDocument(definition, topologyRef));
}
export function createHumanPackageDocument(definition, topologyRef = DEFAULT_TOPOLOGY_REF) {
    return {
        header: {
            magic: PACKAGE_MAGIC,
            version: PACKAGE_VERSION,
            schemaVersion: definition.version,
            topologyRef,
        },
        definition: sortRecord(definition.serialize()),
    };
}
export function migrateHumanPackageDocument(document, targetSchemaVersion, migrations = DEFAULT_PACKAGE_MIGRATIONS) {
    let current = document.header.schemaVersion;
    let values = sortRecord(document.definition);
    const used = new Set();
    while (current !== targetSchemaVersion) {
        const migration = migrations.find((m) => m.from === current && !used.has(`${m.from}->${m.to}`));
        if (!migration) {
            throw new Error(`Unsupported human schema version ${current}`);
        }
        used.add(`${migration.from}->${migration.to}`);
        values = sortRecord(migration.migrate(values));
        current = migration.to;
    }
    return {
        header: { ...document.header, schemaVersion: current },
        definition: values,
    };
}
/** Deserialize a JSON document back into values for a HumanDefinition. */
export function deserializeDocument(text, definition) {
    const parsed = normalizePackageDocument(JSON.parse(text));
    if (parsed.header.magic !== PACKAGE_MAGIC) {
        throw new Error('Unrecognized human package');
    }
    const migrated = migrateHumanPackageDocument(parsed, definition.version);
    definition.patch(migrated.definition);
    const identity = {};
    for (const [path, value] of Object.entries(migrated.definition)) {
        if (path.startsWith('identity.'))
            identity[path] = value;
    }
    return { version: migrated.header.schemaVersion, identity };
}
function normalizePackageDocument(parsed) {
    if (parsed.header) {
        return {
            header: {
                magic: parsed.header.magic ?? '',
                version: parsed.header.version ?? PACKAGE_VERSION,
                schemaVersion: parsed.header.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
                topologyRef: parsed.header.topologyRef ?? DEFAULT_TOPOLOGY_REF,
            },
            definition: parsed.definition ?? {},
        };
    }
    return {
        header: {
            magic: parsed.magic ?? '',
            version: '0.1.0',
            schemaVersion: parsed.schema ?? '1.0',
            topologyRef: DEFAULT_TOPOLOGY_REF,
        },
        definition: parsed.definition ?? {},
    };
}
function renameLegacyDefinitionKeys(input) {
    const out = {};
    for (const [path, value] of Object.entries(input)) {
        out[LEGACY_PROPERTY_RENAMES[path] ?? path] = value;
    }
    return out;
}
const LEGACY_PROPERTY_RENAMES = {
    'anatomy.height': 'global.height',
    'anatomy.muscularity': 'body.muscularity',
    'anatomy.bodyFat': 'body.bodyFat',
    'anatomy.face.nose.width': 'face.nose.width',
    'anatomy.face.nose.length': 'face.nose.length',
    'anatomy.face.jaw.width': 'face.jaw.width',
};
function sortRecord(input) {
    const out = {};
    for (const key of Object.keys(input).sort()) {
        out[key] = input[key];
    }
    return out;
}
//# sourceMappingURL=human-package.js.map