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
export const DEFAULT_DEVICE_RECOVERY_CONFIG = {
    maxAttempts: 6,
    baseDelayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 8000,
    healthyAfterMs: 30_000,
};
/** Deterministic backoff schedule; exported so tests and docs share one source. */
export function deviceBackoffSchedule(attempts, config = DEFAULT_DEVICE_RECOVERY_CONFIG) {
    const out = [];
    for (let i = 0; i < Math.max(0, attempts); i += 1) {
        const raw = config.baseDelayMs * Math.pow(config.backoffFactor, i);
        out.push(Math.min(config.maxDelayMs, Math.round(raw)));
    }
    return out;
}
export class WebGpuDeviceRecovery {
    acquire;
    config;
    hooks;
    sleep;
    now;
    device = null;
    state = 'idle';
    lostCount = 0;
    recoveredCount = 0;
    attempts = 0;
    totalAttempts = 0;
    lastReason = null;
    downtimeMs = 0;
    aliveSince = 0;
    watching = null;
    constructor(acquire, config = {}, hooks = {}) {
        this.acquire = acquire;
        this.config = { ...DEFAULT_DEVICE_RECOVERY_CONFIG, ...config };
        this.hooks = hooks;
        this.sleep = hooks.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
        this.now = hooks.now ?? (() => Date.now());
    }
    get currentDevice() {
        return this.device;
    }
    status() {
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
    async start() {
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
    async settled() {
        const current = this.watching;
        if (current)
            await current;
    }
    adopt(device) {
        this.device = device;
        this.state = 'live';
        this.aliveSince = this.now();
        this.watching = device.lost
            .then((info) => this.handleLost(info))
            .catch(() => this.handleLost({ reason: 'unknown' }));
    }
    async handleLost(info) {
        this.lostCount += 1;
        this.lastReason = info.reason ?? 'unknown';
        const lostAt = this.now();
        if (lostAt - this.aliveSince >= this.config.healthyAfterMs)
            this.attempts = 0;
        this.device = null;
        this.state = 'recovering';
        this.hooks.onLost?.(info);
        const delays = deviceBackoffSchedule(this.config.maxAttempts, this.config);
        for (let i = 0; i < delays.length; i += 1) {
            this.attempts += 1;
            this.totalAttempts += 1;
            await this.sleep(delays[i]);
            let next = null;
            try {
                next = await this.acquire();
            }
            catch {
                next = null;
            }
            if (!next)
                continue;
            try {
                await this.hooks.reinitialize?.(next);
            }
            catch {
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
//# sourceMappingURL=device-recovery.js.map