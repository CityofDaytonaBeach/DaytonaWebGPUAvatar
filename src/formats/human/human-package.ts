import { HumanDefinition } from '../../core/schema/human-definition.js';

/** Deterministic JSON package for persisted HDL state. */

export interface HumanPackageHeader {
  magic: string; // "DHAV"
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

export const PACKAGE_MAGIC = 'DHAV';
export const PACKAGE_VERSION = '0.2.0';
export const DEFAULT_TOPOLOGY_REF = 'canonical-block-human-v0.2';
export const DEFAULT_SCHEMA_VERSION = '1.0';

export const DEFAULT_PACKAGE_MIGRATIONS: HumanPackageMigration[] = [
  { from: '0.1', to: DEFAULT_SCHEMA_VERSION, migrate: renameLegacyDefinitionKeys },
];

/** Serialize a HumanDefinition into a JSON document (lossless, deterministic). */
export function serializeDefinition(
  definition: HumanDefinition,
  topologyRef = DEFAULT_TOPOLOGY_REF,
): string {
  return JSON.stringify(createHumanPackageDocument(definition, topologyRef));
}

export function createHumanPackageDocument(
  definition: HumanDefinition,
  topologyRef = DEFAULT_TOPOLOGY_REF,
): HumanPackageDocument {
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

export function migrateHumanPackageDocument(
  document: HumanPackageDocument,
  targetSchemaVersion: string,
  migrations: readonly HumanPackageMigration[] = DEFAULT_PACKAGE_MIGRATIONS,
): HumanPackageDocument {
  let current = document.header.schemaVersion;
  let values = sortRecord(document.definition);
  const used = new Set<string>();

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
export function deserializeDocument(
  text: string,
  definition: HumanDefinition,
): { version: string; identity: Record<string, number> } {
  const parsed = normalizePackageDocument(
    JSON.parse(text) as Partial<HumanPackageDocument> & LegacyPackageDocument,
  );
  if (parsed.header.magic !== PACKAGE_MAGIC) {
    throw new Error('Unrecognized human package');
  }
  const migrated = migrateHumanPackageDocument(parsed, definition.version);
  definition.patch(migrated.definition);
  const identity: Record<string, number> = {};
  for (const [path, value] of Object.entries(migrated.definition)) {
    if (path.startsWith('identity.')) identity[path] = value;
  }
  return { version: migrated.header.schemaVersion, identity };
}

interface LegacyPackageDocument {
  magic?: string;
  schema?: string;
  definition?: Record<string, number>;
}

function normalizePackageDocument(
  parsed: Partial<HumanPackageDocument> & LegacyPackageDocument,
): HumanPackageDocument {
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

function renameLegacyDefinitionKeys(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [path, value] of Object.entries(input)) {
    out[LEGACY_PROPERTY_RENAMES[path] ?? path] = value;
  }
  return out;
}

const LEGACY_PROPERTY_RENAMES: Record<string, string> = {
  'anatomy.height': 'global.height',
  'anatomy.muscularity': 'body.muscularity',
  'anatomy.bodyFat': 'body.bodyFat',
  'anatomy.face.nose.width': 'face.nose.width',
  'anatomy.face.nose.length': 'face.nose.length',
  'anatomy.face.jaw.width': 'face.jaw.width',
};

function sortRecord(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(input).sort()) {
    out[key] = input[key];
  }
  return out;
}
