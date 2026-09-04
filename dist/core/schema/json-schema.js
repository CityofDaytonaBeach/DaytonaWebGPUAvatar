export function generateHumanDefinitionJsonSchema(registry, id = 'daytona.hdl.flat.v1') {
    const properties = {};
    const required = [];
    for (const meta of registry.all()) {
        properties[meta.path] = jsonSchemaProperty(meta);
        required.push(meta.path);
    }
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: id,
        title: 'Daytona Human Definition Language flat property map',
        type: 'object',
        additionalProperties: false,
        properties,
        required,
    };
}
export function validateHumanDefinitionRecord(registry, record) {
    const issues = [];
    const known = new Set(registry.all().map((meta) => meta.path));
    for (const path of Object.keys(record)) {
        if (!known.has(path)) {
            issues.push({ path, message: 'unknown property' });
        }
    }
    for (const meta of registry.all()) {
        const value = record[meta.path];
        if (value === undefined)
            continue;
        validateValue(meta, value, issues);
    }
    return { valid: issues.length === 0, issues };
}
function jsonSchemaProperty(meta) {
    const out = {
        type: jsonType(meta.type),
        default: meta.type === 'bool' ? meta.default !== 0 : meta.default,
        description: meta.path,
        metadata: {
            id: meta.id,
            units: meta.units,
            category: meta.category,
            persistence: meta.persistence,
            identityImportance: meta.identityImportance,
            gpuByteOffset: meta.gpuByteOffset,
            lodImportance: meta.lodImportance ?? 0,
            animationCapable: meta.animationCapable ?? false,
            automationCapable: meta.automationCapable ?? true,
            dependencies: meta.dependencies ?? [],
        },
    };
    if (meta.min !== undefined)
        out.minimum = meta.min;
    if (meta.max !== undefined)
        out.maximum = meta.max;
    return out;
}
function validateValue(meta, value, issues) {
    if (meta.type === 'bool') {
        if (typeof value !== 'boolean' && value !== 0 && value !== 1) {
            issues.push({ path: meta.path, message: 'expected boolean or 0/1' });
        }
        return;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ path: meta.path, message: 'expected finite number' });
        return;
    }
    if ((meta.type === 'i32' || meta.type === 'u32') && !Number.isInteger(value)) {
        issues.push({ path: meta.path, message: 'expected integer' });
    }
    if (meta.type === 'u32' && value < 0) {
        issues.push({ path: meta.path, message: 'expected unsigned integer' });
    }
    if (meta.min !== undefined && value < meta.min) {
        issues.push({ path: meta.path, message: `below minimum ${meta.min}` });
    }
    if (meta.max !== undefined && value > meta.max) {
        issues.push({ path: meta.path, message: `above maximum ${meta.max}` });
    }
}
function jsonType(type) {
    if (type === 'bool')
        return 'boolean';
    if (type === 'i32' || type === 'u32')
        return 'integer';
    return 'number';
}
//# sourceMappingURL=json-schema.js.map