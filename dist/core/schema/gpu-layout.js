import { alignUp } from './registry.js';
export function wgslFieldName(path) {
    return path.replace(/[^A-Za-z0-9_]/g, '_');
}
export function generateHumanParamsWgsl(registry, structName = 'HumanParams') {
    const lines = [`struct ${structName} {`];
    for (const field of wgslLayoutFields(registry)) {
        lines.push(`  // ${field.path} @ byte ${field.byteOffset}`);
        lines.push(`  ${field.name} : ${field.type},`);
    }
    lines.push('};');
    return lines.join('\n');
}
export function validateWgslLayout(registry) {
    const issues = [];
    const fields = wgslLayoutFields(registry);
    const names = new Set();
    let cursor = 0;
    for (const field of fields) {
        const meta = registry.require(field.path);
        cursor = alignUp(cursor, field.byteSize);
        if (field.byteOffset !== cursor) {
            issues.push({
                path: field.path,
                message: `expected byte offset ${cursor}, got ${field.byteOffset}`,
            });
        }
        if (meta.gpuByteOffset !== field.byteOffset) {
            issues.push({
                path: field.path,
                message: `registry byte offset ${meta.gpuByteOffset} does not match WGSL offset ${field.byteOffset}`,
            });
        }
        if (meta.type === 'f64' || meta.type === 'bool') {
            issues.push({
                path: field.path,
                message: `property type ${meta.type} is not supported in HumanParams WGSL layout`,
            });
        }
        if (names.has(field.name)) {
            issues.push({ path: field.path, message: `duplicate WGSL field name ${field.name}` });
        }
        names.add(field.name);
        cursor += field.byteSize;
    }
    return {
        valid: issues.length === 0,
        byteSize: alignUp(cursor, 16),
        fields,
        issues,
    };
}
export function wgslLayoutFields(registry) {
    return registry.all().map((meta) => ({
        path: meta.path,
        name: wgslFieldName(meta.path),
        type: wgslScalarType(meta),
        byteOffset: meta.gpuByteOffset ?? 0,
        byteSize: wgslScalarByteSize(meta.type),
    }));
}
function wgslScalarType(meta) {
    switch (meta.type) {
        case 'u32':
            return 'u32';
        case 'i32':
            return 'i32';
        case 'f32':
        default:
            return 'f32';
    }
}
function wgslScalarByteSize(type) {
    return type === 'f64' ? 8 : 4;
}
//# sourceMappingURL=gpu-layout.js.map