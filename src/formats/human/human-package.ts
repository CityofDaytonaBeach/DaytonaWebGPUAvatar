import { HumanDefinition } from "../../core/schema/human-definition";

/**
 * HDL binary package format (v0.1 placeholder). Once the schema stabilizes,
 * this becomes a compact binary container: header + schema version +
 * canonical topology reference + parameters + sparse morphs + skeleton +
 * timeline snapshot. Serialization must remain deterministic.
 */

export interface HumanPackageHeader {
  magic: string; // "DHAV"
  version: string;
  schemaVersion: string;
  topologyRef: string;
}

export const PACKAGE_MAGIC = "DHAV";

/** Serialize a HumanDefinition into a JSON document (lossless, deterministic). */
export function serializeDefinition(definition: HumanDefinition): string {
  return JSON.stringify({ magic: PACKAGE_MAGIC, schema: "1.0", definition: definition.serialize() });
}

/** Deserialize a JSON document back into values for a HumanDefinition. */
export function deserializeDocument(
  text: string,
  definition: HumanDefinition
): { version: string; identity: Record<string, number> } {
  const parsed = JSON.parse(text) as {
    magic?: string;
    schema?: string;
    definition?: Record<string, number>;
  };
  if (parsed.magic !== PACKAGE_MAGIC) {
    throw new Error("Unrecognized human package");
  }
  if (parsed.definition) {
    definition.patch(parsed.definition);
  }
  const identity: Record<string, number> = {};
  for (const [path, value] of Object.entries(parsed.definition ?? {})) {
    if (path.startsWith("identity.")) identity[path] = value;
  }
  return { version: parsed.schema ?? "1.0", identity };
}
