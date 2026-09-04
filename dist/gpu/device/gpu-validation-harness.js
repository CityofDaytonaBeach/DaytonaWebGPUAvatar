/**
 * GPU validation harness — direction.md P22's last uncovered gate
 * ("GPU validation errors: buffer/dispatch bounds at the WebGPU boundary").
 *
 * Two halves, deliberately separated so the important one runs in CI:
 *
 *  1. **Headless bounds validation** (`validateDispatch`, `validateBufferBinding`,
 *     `validateComputeResources`): pure arithmetic over the same numbers the SDK
 *     hands to WebGPU — workgroup counts vs device limits, buffer sizes vs the
 *     strides/offsets a kernel reads, packed morph ranges vs the delta array.
 *     These catch the *class* of bug a validation error would report, on a
 *     machine with no GPU at all.
 *  2. **Live error-scope capture** (`GpuValidationHarness`): wraps real work in
 *     `pushErrorScope('validation')` / `popErrorScope()` plus `device.onuncapturederror`
 *     so a browser/CI run with a device surfaces every validation and
 *     out-of-memory error as structured data instead of console noise.
 *
 * Nothing in the existing GPU path changes: the harness observes, it does not
 * wrap or replace `GpuMorphDeform`, `SkinningKernel`, or the renderer.
 */
export const DEFAULT_GPU_LIMITS = {
    maxComputeWorkgroupsPerDimension: 65535,
    maxComputeInvocationsPerWorkgroup: 256,
    maxStorageBufferBindingSize: 134_217_728,
    maxUniformBufferBindingSize: 65_536,
    maxBufferSize: 268_435_456,
};
export function resolveLimits(limits) {
    return { ...DEFAULT_GPU_LIMITS, ...(limits ?? {}) };
}
/** Validate one compute dispatch against device limits and coverage. */
export function validateDispatch(spec, limits) {
    const l = resolveLimits(limits);
    const issues = [];
    const push = (code, message) => {
        issues.push({ code, message, severity: 'validation', scope: spec.scope });
    };
    if (!Number.isInteger(spec.workgroupSize) || spec.workgroupSize <= 0) {
        push('dispatch.invalid-workgroup-size', `workgroupSize must be a positive integer`);
    }
    else if (spec.workgroupSize > l.maxComputeInvocationsPerWorkgroup) {
        push('dispatch.workgroup-size-exceeds-limit', `workgroupSize ${spec.workgroupSize} > maxComputeInvocationsPerWorkgroup ${l.maxComputeInvocationsPerWorkgroup}`);
    }
    const axes = ['x', 'y', 'z'];
    spec.workgroups.forEach((count, i) => {
        if (!Number.isInteger(count) || count < 0) {
            push('dispatch.invalid-workgroup-count', `workgroups.${axes[i]} must be a non-negative integer`);
            return;
        }
        if (count > l.maxComputeWorkgroupsPerDimension) {
            push('dispatch.exceeds-limit', `workgroups.${axes[i]} ${count} > maxComputeWorkgroupsPerDimension ${l.maxComputeWorkgroupsPerDimension}`);
        }
    });
    const total = spec.workgroups[0] * spec.workgroups[1] * spec.workgroups[2] * Math.max(1, spec.workgroupSize);
    if (spec.workItems > 0 && total < spec.workItems) {
        push('dispatch.under-covers-work', `dispatch covers ${total} invocations but ${spec.workItems} work items exist (mesh would be partially deformed)`);
    }
    // A grid more than one workgroup larger than needed means an out-of-range
    // thread block that relies on the shader's own bounds check.
    if (spec.workItems > 0 && total >= spec.workItems + spec.workgroupSize) {
        push('dispatch.over-covers-work', `dispatch covers ${total} invocations for ${spec.workItems} work items (>=1 fully wasted workgroup)`);
    }
    return { ok: issues.length === 0, issues, checked: 4 };
}
/** Validate that a shader's worst-case access stays inside a bound buffer. */
export function validateBufferBinding(spec, limits) {
    const l = resolveLimits(limits);
    const issues = [];
    const push = (code, message, severity = 'validation') => {
        issues.push({ code, message, severity, scope: spec.scope });
    };
    const offset = spec.offset ?? 0;
    if (spec.byteSize <= 0)
        push('buffer.empty', `${spec.label}: buffer has zero size`);
    if (offset % 4 !== 0)
        push('buffer.misaligned-offset', `${spec.label}: offset ${offset} not 4-byte aligned`);
    if (spec.strideBytes <= 0 || spec.strideBytes % 4 !== 0) {
        push('buffer.invalid-stride', `${spec.label}: stride ${spec.strideBytes} must be a positive multiple of 4`);
    }
    const required = offset + (spec.maxElementIndex + 1) * spec.strideBytes;
    if (spec.maxElementIndex >= 0 && required > spec.byteSize) {
        push('buffer.out-of-bounds', `${spec.label}: shader reads up to byte ${required} but buffer is ${spec.byteSize} bytes`);
    }
    const cap = spec.kind === 'uniform' ? l.maxUniformBufferBindingSize : l.maxStorageBufferBindingSize;
    if (spec.byteSize > cap) {
        push('buffer.exceeds-binding-limit', `${spec.label}: ${spec.byteSize} bytes > ${spec.kind === 'uniform' ? 'maxUniformBufferBindingSize' : 'maxStorageBufferBindingSize'} ${cap}`, 'out-of-memory');
    }
    if (spec.byteSize > l.maxBufferSize) {
        push('buffer.exceeds-max-size', `${spec.label}: ${spec.byteSize} bytes > maxBufferSize ${l.maxBufferSize}`, 'out-of-memory');
    }
    return { ok: issues.length === 0, issues, checked: 5 };
}
/** Validate a whole compute pass: dispatch grid plus every bound buffer. */
export function validateComputeResources(spec, limits) {
    const reports = [
        validateDispatch(spec.dispatch, limits),
        ...spec.bindings.map((b) => validateBufferBinding(b, limits)),
    ];
    const issues = reports.flatMap((r) => r.issues);
    return {
        ok: issues.length === 0,
        issues,
        checked: reports.reduce((acc, r) => acc + r.checked, 0),
    };
}
/**
 * Validate packed sparse-morph buffers: every morph's (offset, count) range must
 * stay inside the delta array, and every vertex index inside the mesh. This is
 * the exact indexing the morph compute kernel performs.
 */
export function validatePackedMorphBounds(scope, deltaPacked, morphStruct, vertexCount) {
    const issues = [];
    const push = (code, message) => {
        issues.push({ code, message, severity: 'validation', scope });
    };
    const slots = deltaPacked.length / 4;
    if (deltaPacked.length % 4 !== 0)
        push('morph.delta-misaligned', 'deltaPacked length is not a multiple of 4');
    if (morphStruct.length % 4 !== 0)
        push('morph.struct-misaligned', 'morphStruct length is not a multiple of 4');
    const morphCount = Math.floor(morphStruct.length / 4);
    for (let i = 0; i < morphCount; i++) {
        const count = morphStruct[i * 4 + 1];
        const offset = morphStruct[i * 4 + 2];
        if (offset + count > slots) {
            push('morph.range-out-of-bounds', `morph ${i}: range [${offset}, ${offset + count}) exceeds ${slots} delta slots`);
        }
    }
    for (let s = 0; s < slots; s++) {
        const index = deltaPacked[s * 4];
        if (index >= vertexCount) {
            push('morph.vertex-index-out-of-bounds', `delta slot ${s}: vertex ${index} >= vertexCount ${vertexCount}`);
            break; // one representative failure is enough; keeps the check O(n) and quiet
        }
    }
    return { ok: issues.length === 0, issues, checked: morphCount + 2 };
}
/**
 * Live harness: wraps real GPU work in validation error scopes.
 *
 * Usage is intentionally minimal so it can sit around any existing call:
 *
 *   const harness = new GpuValidationHarness(device);
 *   await harness.capture('morph dispatch', () => { morph.dispatch(encoder); });
 *   expect(harness.issues).toEqual([]);
 */
export class GpuValidationHarness {
    device;
    captured = [];
    constructor(device) {
        this.device = device;
    }
    get issues() {
        return this.captured;
    }
    get ok() {
        return this.captured.length === 0;
    }
    /** Device limits, falling back to conservative WebGPU defaults. */
    limits() {
        return resolveLimits(this.device.limits);
    }
    /** Run `work` inside validation + out-of-memory error scopes. */
    async capture(scope, work) {
        this.device.pushErrorScope('out-of-memory');
        this.device.pushErrorScope('validation');
        let result;
        try {
            result = await work();
        }
        finally {
            const validation = await this.device.popErrorScope();
            const oom = await this.device.popErrorScope();
            if (validation)
                this.record(scope, validation, 'validation');
            if (oom)
                this.record(scope, oom, 'out-of-memory');
        }
        return result;
    }
    /** Fold a headless bounds report into the same issue list. */
    merge(report) {
        this.captured.push(...report.issues);
        return this;
    }
    /** Throw if anything was captured — the CI-facing assertion. */
    assertClean() {
        if (this.captured.length === 0)
            return;
        throw new Error(`GPU validation failed (${this.captured.length}):\n` +
            this.captured.map((i) => ` - [${i.scope}] ${i.code}: ${i.message}`).join('\n'));
    }
    report() {
        return { ok: this.ok, issues: [...this.captured], checked: this.captured.length };
    }
    clear() {
        this.captured.length = 0;
    }
    record(scope, error, severity) {
        this.captured.push({
            code: severity === 'validation' ? 'device.validation-error' : 'device.out-of-memory',
            message: error.message ?? String(error),
            severity,
            scope,
        });
    }
}
//# sourceMappingURL=gpu-validation-harness.js.map