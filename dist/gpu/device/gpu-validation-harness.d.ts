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
export type GpuValidationSeverity = 'validation' | 'out-of-memory' | 'internal' | 'unknown';
export interface GpuValidationIssue {
    /** Stable machine-readable code, e.g. 'dispatch.exceeds-limit'. */
    code: string;
    message: string;
    severity: GpuValidationSeverity;
    /** Scope label supplied by the caller (kernel or pass name). */
    scope: string;
}
export interface GpuBoundsReport {
    ok: boolean;
    issues: GpuValidationIssue[];
    checked: number;
}
/** Conservative WebGPU defaults, used when no real device limits are available. */
export interface GpuLimits {
    maxComputeWorkgroupsPerDimension: number;
    maxComputeInvocationsPerWorkgroup: number;
    maxStorageBufferBindingSize: number;
    maxUniformBufferBindingSize: number;
    maxBufferSize: number;
}
export declare const DEFAULT_GPU_LIMITS: GpuLimits;
export type GpuLimitsLike = Partial<GpuLimits>;
export declare function resolveLimits(limits?: GpuLimitsLike): GpuLimits;
export interface DispatchSpec {
    scope: string;
    /** Total invocations required (usually the vertex count). */
    workItems: number;
    /** Workgroup size declared by the WGSL kernel (@workgroup_size). */
    workgroupSize: number;
    /** Workgroup counts actually passed to dispatchWorkgroups. */
    workgroups: [number, number, number];
}
/** Validate one compute dispatch against device limits and coverage. */
export declare function validateDispatch(spec: DispatchSpec, limits?: GpuLimitsLike): GpuBoundsReport;
export interface BufferBindingSpec {
    scope: string;
    label: string;
    /** Size of the bound buffer in bytes. */
    byteSize: number;
    /** Byte offset of the binding. */
    offset?: number;
    /** Element stride in bytes as read by the shader. */
    strideBytes: number;
    /** Highest element index the shader may read/write. */
    maxElementIndex: number;
    kind?: 'storage' | 'uniform';
}
/** Validate that a shader's worst-case access stays inside a bound buffer. */
export declare function validateBufferBinding(spec: BufferBindingSpec, limits?: GpuLimitsLike): GpuBoundsReport;
export interface ComputeResourceSpec {
    scope: string;
    dispatch: DispatchSpec;
    bindings: BufferBindingSpec[];
}
/** Validate a whole compute pass: dispatch grid plus every bound buffer. */
export declare function validateComputeResources(spec: ComputeResourceSpec, limits?: GpuLimitsLike): GpuBoundsReport;
/**
 * Validate packed sparse-morph buffers: every morph's (offset, count) range must
 * stay inside the delta array, and every vertex index inside the mesh. This is
 * the exact indexing the morph compute kernel performs.
 */
export declare function validatePackedMorphBounds(scope: string, deltaPacked: Uint32Array, morphStruct: Uint32Array, vertexCount: number): GpuBoundsReport;
interface ErrorScopeCapableDevice {
    pushErrorScope(filter: GPUErrorFilter): void;
    popErrorScope(): Promise<GPUError | null>;
    onuncapturederror?: unknown;
    limits?: GpuLimitsLike;
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
export declare class GpuValidationHarness {
    private readonly device;
    private readonly captured;
    constructor(device: ErrorScopeCapableDevice);
    get issues(): readonly GpuValidationIssue[];
    get ok(): boolean;
    /** Device limits, falling back to conservative WebGPU defaults. */
    limits(): GpuLimits;
    /** Run `work` inside validation + out-of-memory error scopes. */
    capture<T>(scope: string, work: () => T | Promise<T>): Promise<T>;
    /** Fold a headless bounds report into the same issue list. */
    merge(report: GpuBoundsReport): this;
    /** Throw if anything was captured — the CI-facing assertion. */
    assertClean(): void;
    report(): GpuBoundsReport;
    clear(): void;
    private record;
}
export {};
//# sourceMappingURL=gpu-validation-harness.d.ts.map