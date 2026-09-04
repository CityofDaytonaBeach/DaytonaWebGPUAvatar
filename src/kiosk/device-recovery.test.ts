import { describe, it, expect } from 'vitest';
import {
  WebGpuDeviceRecovery,
  deviceBackoffSchedule,
  DEFAULT_DEVICE_RECOVERY_CONFIG,
  type RecoverableDevice,
} from './device-recovery.js';

interface FakeDevice extends RecoverableDevice {
  id: number;
  kill(reason?: string): void;
  destroyed: boolean;
}

function fakeDevice(id: number): FakeDevice {
  let resolve!: (info: { reason: string }) => void;
  const lost = new Promise<{ reason: string }>((r) => (resolve = r));
  const device: FakeDevice = {
    id,
    lost,
    destroyed: false,
    destroy() {
      device.destroyed = true;
    },
    kill(reason = 'destroyed') {
      resolve({ reason });
    },
  };
  return device;
}

const instantSleep = async () => {};

describe('WebGpuDeviceRecovery', () => {
  it('produces a deterministic capped backoff schedule', () => {
    expect(deviceBackoffSchedule(5, DEFAULT_DEVICE_RECOVERY_CONFIG)).toEqual([
      250, 500, 1000, 2000, 4000,
    ]);
    expect(deviceBackoffSchedule(8, DEFAULT_DEVICE_RECOVERY_CONFIG).at(-1)).toBe(
      DEFAULT_DEVICE_RECOVERY_CONFIG.maxDelayMs,
    );
  });

  it('acquires a device and reports live', async () => {
    const device = fakeDevice(1);
    const recovery = new WebGpuDeviceRecovery(async () => device, {}, { sleep: instantSleep });
    expect(await recovery.start()).toBe(true);
    expect(recovery.status().state).toBe('live');
    expect(recovery.currentDevice).toBe(device);
  });

  it('recovers after device loss and re-initialises resources', async () => {
    const devices = [fakeDevice(1), fakeDevice(2)];
    let index = 0;
    const reinitialised: number[] = [];
    const lostReasons: string[] = [];
    const recovery = new WebGpuDeviceRecovery(
      async () => devices[index++] ?? null,
      {},
      {
        sleep: instantSleep,
        reinitialize: (device) => {
          reinitialised.push((device as FakeDevice).id);
        },
        onLost: (info) => lostReasons.push(info.reason),
      },
    );
    await recovery.start();
    devices[0]!.kill('driver reset');
    await recovery.settled();

    const status = recovery.status();
    expect(lostReasons).toEqual(['driver reset']);
    expect(reinitialised).toEqual([2]);
    expect(status.state).toBe('live');
    expect(status.lostCount).toBe(1);
    expect(status.recoveredCount).toBe(1);
    expect((recovery.currentDevice as FakeDevice).id).toBe(2);
  });

  it('retries with backoff while acquisition keeps failing', async () => {
    const first = fakeDevice(1);
    const eventual = fakeDevice(2);
    let calls = 0;
    const delays: number[] = [];
    const recovery = new WebGpuDeviceRecovery(
      async () => {
        calls += 1;
        if (calls === 1) return first;
        if (calls < 4) return null;
        return eventual;
      },
      {},
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    await recovery.start();
    first.kill('gpu process crashed');
    await recovery.settled();
    expect(delays).toEqual([250, 500, 1000]);
    expect(recovery.status().state).toBe('live');
    expect(recovery.status().attempts).toBe(0);
    expect(recovery.status().totalAttempts).toBe(3);
  });

  it('discards a device whose re-initialisation throws', async () => {
    const first = fakeDevice(1);
    const bad = fakeDevice(2);
    const good = fakeDevice(3);
    const queue = [first, bad, good];
    const recovery = new WebGpuDeviceRecovery(
      async () => queue.shift() ?? null,
      {},
      {
        sleep: instantSleep,
        reinitialize: (device) => {
          if ((device as FakeDevice).id === 2) throw new Error('pipeline rebuild failed');
        },
      },
    );
    await recovery.start();
    first.kill();
    await recovery.settled();
    expect(bad.destroyed).toBe(true);
    expect((recovery.currentDevice as FakeDevice).id).toBe(3);
  });

  it('gives up after maxAttempts and reports failure', async () => {
    const first = fakeDevice(1);
    let calls = 0;
    let failed: { reason: string | null; attempts: number } | null = null;
    const recovery = new WebGpuDeviceRecovery(
      async () => {
        calls += 1;
        return calls === 1 ? first : null;
      },
      { maxAttempts: 3 },
      {
        sleep: instantSleep,
        onFailed: (reason, attempts) => {
          failed = { reason, attempts };
        },
      },
    );
    await recovery.start();
    first.kill('unknown');
    await recovery.settled();
    expect(recovery.status().state).toBe('failed');
    expect(recovery.currentDevice).toBeNull();
    expect(failed).toEqual({ reason: 'unknown', attempts: 3 });
  });

  it('survives repeated losses over a long session', async () => {
    let id = 0;
    let clock = 0;
    const devices: FakeDevice[] = [];
    const recovery = new WebGpuDeviceRecovery(
      async () => {
        const device = fakeDevice(++id);
        devices.push(device);
        return device;
      },
      {},
      { sleep: instantSleep, now: () => clock },
    );
    await recovery.start();
    for (let i = 0; i < 25; i += 1) {
      clock += 60_000; // an hour-ish of healthy runtime between crashes
      devices.at(-1)!.kill(`loss ${i}`);
      await recovery.settled();
      expect(recovery.status().state).toBe('live');
    }
    const status = recovery.status();
    expect(status.lostCount).toBe(25);
    expect(status.recoveredCount).toBe(25);
    // Attempt counter resets after healthy runtime, so it never creeps to maxAttempts.
    expect(status.totalAttempts).toBe(25);
  });
});
