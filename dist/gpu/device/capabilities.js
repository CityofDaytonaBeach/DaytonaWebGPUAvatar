/**
 * Device capability detection + profile selection. Capability is derived from
 * actual limits and exploratory checks, never purely from device name.
 */
export async function createDeviceAndProfile(desiredFeatures = []) {
    const gpu = navigator.gpu;
    if (!gpu) {
        throw new Error('WebGPU is not available in this browser.');
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
        throw new Error('No suitable WebGPU adapter found.');
    }
    const features = [];
    for (const f of desiredFeatures) {
        if (adapter.features.has(f)) {
            features.push(f);
        }
        else if (f === 'timestamp-query') {
            // optional
        }
        else {
            throw new Error(`Required GPU feature missing: ${f}`);
        }
    }
    const device = await adapter.requestDevice({
        requiredFeatures: features,
        requiredLimits: { maxStorageBuffersPerShaderStage: 16 },
    });
    const limits = device.limits;
    const timestampQuerySupport = adapter.features.has('timestamp-query');
    const subgroupSupport = adapter.features.has('subgroups');
    const profile = scoreProfile(adapter, limits);
    return {
        adapter,
        device,
        profile,
        timestampQuerySupport,
        subgroupSupport,
        maxBufferSize: limits.maxBufferSize,
        maxComputeWorkgroupSize: limits.maxComputeWorkgroupSizeX ?? 256,
        maxVertexBufferStride: limits.maxVertexBufferArrayStride ?? 2048,
    };
}
function scoreProfile(adapter, limits) {
    // Conservative heuristic combining adapter info + limits. Bumped profiles
    // can be refined with self-benchmarks later.
    const maxStorage = limits.maxStorageBufferBindingSize ?? 0;
    const maxVertices = limits.maxVertexAttributes ?? 0;
    let score = 0;
    if (maxStorage >= 2 ** 30)
        score += 4;
    else if (maxStorage >= 256 * 2 ** 20)
        score += 2;
    else
        score += 1;
    if (maxVertices >= 16)
        score += 2;
    else if (maxVertices >= 8)
        score += 1;
    if (adapter.info.vendor.toLowerCase().includes('nvidia') ||
        adapter.info.vendor.toLowerCase().includes('amd'))
        score += 2;
    if (score >= 7)
        return 'CINEMATIC';
    if (score >= 5)
        return 'HIGH';
    if (score >= 4)
        return 'MEDIUM';
    if (score >= 3)
        return 'LOW';
    return 'COMPATIBILITY';
}
//# sourceMappingURL=capabilities.js.map