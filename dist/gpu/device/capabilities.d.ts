export type DeviceProfile = 'CINEMATIC' | 'HIGH' | 'MEDIUM' | 'LOW' | 'COMPATIBILITY';
export interface DeviceCapabilities {
    adapter: GPUAdapter;
    device: GPUDevice;
    profile: DeviceProfile;
    timestampQuerySupport: boolean;
    subgroupSupport: boolean;
    maxBufferSize: number;
    maxComputeWorkgroupSize: number;
    maxVertexBufferStride: number;
}
/**
 * Device capability detection + profile selection. Capability is derived from
 * actual limits and exploratory checks, never purely from device name.
 */
export declare function createDeviceAndProfile(desiredFeatures?: GPUFeatureName[]): Promise<DeviceCapabilities>;
//# sourceMappingURL=capabilities.d.ts.map