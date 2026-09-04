/**
 * WebGPU device recovery.
 *
 * A kiosk runs for weeks. Over that span the GPU device *will* be lost: driver
 * resets, GPU process crashes, laptop lid/dock events, OS power transitions.
 * Without recovery the avatar becomes a black rectangle until someone reboots
 * the machine — the single most likely failure a deployed kiosk hits.
 *
 * This module watches `device.lost`, rebuilds the device through a caller
 * supplied factory with deterministic exponential backoff, and re-runs the
 * caller's resource re-initialisation. It is deliberately structural (no
 * `navigator.gpu` import) so it runs headlessly in tests and against a real
 * `GPUDevice` in the browser without changes.
 */
export interface DeviceLostLike {
    reason: string;
    message?: string;
}
export interface RecoverableDevice {
    /** Resolves when the device is lost. Mirrors `GPUDevice.lost`. */
    lost: Promise<DeviceLostLike>;
    destroy?(): void;
}
export interface DeviceRecoveryConfig {
    /** Maximum consecutive re-acquire attempts before giving up. */
    maxAttempts: number;
    /** First backoff delay, ms. */
    baseDelayMs: number;
    /** Backoff multiplier per attempt. */
    backoffFactor: number;
    /** Delay ceiling, ms. */
    maxDelayMs: number;
    /** Reset the attempt counter after this long alive, ms (a healthy session). */
    healthyAfterMs: number;
}
export declare const DEFAULT_DEVICE_RECOVERY_CONFIG: DeviceRecoveryConfig;
export type DeviceRecoveryState = 'idle' | 'live' | 'recovering' | 'failed';
export interface DeviceRecoveryStatus {
    state: DeviceRecoveryState;
    /** Times the device was lost since start. */
    lostCount: number;
    /** Successful recoveries since start. */
    recoveredCount: number;
    /** Attempts made during the current recovery. */
    attempts: number;
    /** Total attempts across all recoveries. */
    totalAttempts: number;
    lastReason: string | null;
    /** ms of accumulated downtime, measured on the injected clock. */
    downtimeMs: number;
}
export interface DeviceRecoveryHooks {
    /** Rebuild pipelines/buffers/textures against the fresh device. */
    reinitialize?: (device: RecoverableDevice) => void | Promise<void>;
    onLost?: (info: DeviceLostLike) => void;
    onRecovered?: (device: RecoverableDevice, attempts: number) => void;
    onFailed?: (lastReason: string | null, attempts: number) => void;
    /** Injected for tests; defaults to setTimeout. */
    sleep?: (ms: number) => Promise<void>;
    /** Injected for tests; defaults to Date.now. */
    now?: () => number;
}
/** Deterministic backoff schedule; exported so tests and docs share one source. */
export declare function deviceBackoffSchedule(attempts: number, config?: DeviceRecoveryConfig): number[];
export declare class WebGpuDeviceRecovery {
    private readonly acquire;
    private readonly config;
    private readonly hooks;
    private readonly sleep;
    private readonly now;
    private device;
    private state;
    private lostCount;
    private recoveredCount;
    private attempts;
    private totalAttempts;
    private lastReason;
    private downtimeMs;
    private aliveSince;
    private watching;
    constructor(acquire: () => Promise<RecoverableDevice | null>, config?: Partial<DeviceRecoveryConfig>, hooks?: DeviceRecoveryHooks);
    get currentDevice(): RecoverableDevice | null;
    status(): DeviceRecoveryStatus;
    /** Acquire the first device and start watching for loss. */
    start(): Promise<boolean>;
    /**
     * Resolves once the watch cycle in flight when this was called has settled
     * (device lost -> recovered or failed). It deliberately does not wait on the
     * *next* cycle, which would never resolve while the device stays healthy.
     */
    settled(): Promise<void>;
    private adopt;
    private handleLost;
}
//# sourceMappingURL=device-recovery.d.ts.map