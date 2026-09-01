import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "../../core/schema/descriptors";
import { HumanDefinition } from "../../core/schema/human-definition";
import { DEFAULT_TOPOLOGY_REF, PACKAGE_MAGIC, PACKAGE_VERSION, deserializeDocument, migrateHumanPackageDocument, serializeDefinition } from "./human-package";

describe("human package format", () => {
  it("serializes a versioned deterministic package document", () => {
    const def = new HumanDefinition(createDefaultRegistry());
    const first = serializeDefinition(def);
    const second = serializeDefinition(def);
    const parsed = JSON.parse(first);

    expect(first).toBe(second);
    expect(parsed.header.magic).toBe(PACKAGE_MAGIC);
    expect(parsed.header.version).toBe(PACKAGE_VERSION);
    expect(parsed.header.schemaVersion).toBe(def.version);
    expect(parsed.header.topologyRef).toBe(DEFAULT_TOPOLOGY_REF);
  });

  it("deserializes into a definition and returns identity fields", () => {
    const registry = createDefaultRegistry();
    const source = new HumanDefinition(registry, { "identity.seed": 123, "face.nose.width": 0.75 });
    const target = new HumanDefinition(registry);

    const result = deserializeDocument(serializeDefinition(source), target);

    expect(result.version).toBe(source.version);
    expect(result.identity["identity.seed"]).toBe(123);
    expect(target.get("face.nose.width")).toBe(0.75);
  });

  it("rejects unsupported schema versions", () => {
    const def = new HumanDefinition(createDefaultRegistry());
    const parsed = JSON.parse(serializeDefinition(def));
    parsed.header.schemaVersion = "99.0";

    expect(() => deserializeDocument(JSON.stringify(parsed), def)).toThrow(/Unsupported human schema version/);
  });

  it("migrates legacy schema keys before deserializing", () => {
    const target = new HumanDefinition(createDefaultRegistry());
    const legacy = JSON.stringify({
      magic: PACKAGE_MAGIC,
      schema: "0.1",
      definition: {
        "identity.seed": 44,
        "anatomy.height": 1.9,
        "anatomy.face.nose.width": 0.8,
      },
    });

    const result = deserializeDocument(legacy, target);

    expect(result.version).toBe(target.version);
    expect(target.get("global.height")).toBe(1.9);
    expect(target.get("face.nose.width")).toBe(0.8);
  });

  it("exposes package migration without mutating the source document", () => {
    const source = {
      header: { magic: PACKAGE_MAGIC, version: "0.1.0", schemaVersion: "0.1", topologyRef: DEFAULT_TOPOLOGY_REF },
      definition: { "anatomy.muscularity": 0.7 },
    };
    const migrated = migrateHumanPackageDocument(source, "1.0");

    expect(source.definition["anatomy.muscularity"]).toBe(0.7);
    expect(migrated.header.schemaVersion).toBe("1.0");
    expect(migrated.definition["body.muscularity"]).toBe(0.7);
  });
});
