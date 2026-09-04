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

export const DEFAULT_DEVICE_RECOVERY_CONFIG: DeviceRecoveryConfig = {
  maxAttempts: 6,
  baseDelayMs: 250,
  backoffFactor: 2,
  maxDelayMs: 8000,
  healthyAfterMs: 30_000,
};

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
export function deviceBackoffSchedule(
  attempts: number,
  config: DeviceRecoveryConfig = DEFAULT_DEVICE_RECOVERY_CONFIG,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(0, attempts); i += 1) {
    const raw = config.baseDelayMs * Math.pow(config.backoffFactor, i);
    out.push(Math.min(config.maxDelayMs, Math.round(raw)));
  }
  return out;
}

export class WebGpuDeviceRecovery {
  private readonly config: DeviceRecoveryConfig;
  private readonly hooks: DeviceRecoveryHooks;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  private device: RecoverableDevice | null = null;
  private state: DeviceRecoveryState = 'idle';
  private lostCount = 0;
  private recoveredCount = 0;
  private attempts = 0;
  private totalAttempts = 0;
  private lastReason: string | null = null;
  private downtimeMs = 0;
  private aliveSince = 0;
  private watching: Promise<void> | null = null;

  constructor(
    private readonly acquire: () => Promise<RecoverableDevice | null>,
    config: Partial<DeviceRecoveryConfig> = {},
    hooks: DeviceRecoveryHooks = {},
  ) {
    this.config = { ...DEFAULT_DEVICE_RECOVERY_CONFIG, ...config };
    this.hooks = hooks;
    this.sleep = hooks.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = hooks.now ?? (() => Date.now());
  }

  get currentDevice(): RecoverableDevice | null {
    return this.device;
  }

  status(): DeviceRecoveryStatus {
    return {
      state: this.state,
      lostCount: this.lostCount,
      recoveredCount: this.recoveredCount,
      attempts: this.attempts,
      totalAttempts: this.totalAttempts,
      lastReason: this.lastReason,
      downtimeMs: this.downtimeMs,
    };
  }

  /** Acquire the first device and start watching for loss. */
  async start(): Promise<boolean> {
    const device = await this.acquire();
    if (!device) {
      this.state = 'failed';
      this.hooks.onFailed?.(this.lastReason, this.attempts);
      return false;
    }
    this.adopt(device);
    return true;
  }

  /**
   * Resolves once the watch cycle in flight when this was called has settled
   * (device lost -> recovered or failed). It deliberately does not wait on the
   * *next* cycle, which would never resolve while the device stays healthy.
   */
  async settled(): Promise<void> {
    const current = this.watching;
    if (current) await current;
  }

  private adopt(device: RecoverableDevice): void {
    this.device = device;
    this.state = 'live';
    this.aliveSince = this.now();
    this.watching = device.lost
      .then((info) => this.handleLost(info))
      .catch(() => this.handleLost({ reason: 'unknown' }));
  }

  private async handleLost(info: DeviceLostLike): Promise<void> {
    this.lostCount += 1;
    this.lastReason = info.reason ?? 'unknown';
    const lostAt = this.now();
    if (lostAt - this.aliveSince >= this.config.healthyAfterMs) this.attempts = 0;
    this.device = null;
    this.state = 'recovering';
    this.hooks.onLost?.(info);

    const delays = deviceBackoffSchedule(this.config.maxAttempts, this.config);
    for (let i = 0; i < delays.length; i += 1) {
      this.attempts += 1;
      this.totalAttempts += 1;
      await this.sleep(delays[i]!);
      let next: RecoverableDevice | null = null;
      try {
        next = await this.acquire();
      } catch {
        next = null;
      }
      if (!next) continue;
      try {
        await this.hooks.reinitialize?.(next);
      } catch {
        next.destroy?.();
        continue;
      }
      this.downtimeMs += this.now() - lostAt;
      this.recoveredCount += 1;
      const attemptsUsed = this.attempts;
      this.attempts = 0;
      this.adopt(next);
      this.hooks.onRecovered?.(next, attemptsUsed);
      return;
    }

    this.downtimeMs += this.now() - lostAt;
    this.state = 'failed';
    this.watching = null;
    this.hooks.onFailed?.(this.lastReason, this.attempts);
  }
}
