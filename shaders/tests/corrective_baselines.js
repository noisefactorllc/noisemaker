import { execFileSync } from 'node:child_process'

// Both backends use the same Metal device on these verified Apple GPUs.
const BASELINES = new Map([
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', {
        plasticDefault: 'c2dd9c18ec53919f94c921968dc3af3f0127acb5dd9bf817bb7975aaecccd8c3',
        halftoneLine: '842b9a9d8176638ead50666b3f97b0756ab403e129fe46ad007f57c4626bd2ce',
        mosaic: '662262ed0c4723f20802e300bd2f6637cea6d71b9fbc38bb562a89f94f25ac3d',
        paperWebGPU: 'c7b10f508852415ffb5b947f615b323749530aab1bf0815d4705c92f4c0b6dd6'
    }],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)', {
        plasticDefault: 'a2553a928da58a3a8513306d6c2b9420bf31eef4fdb51687e8dc1b9c6e2f3ccc',
        halftoneLine: 'ca2097ced765d7e77eaf1904c9f2932892115d4b03974cdad92a94ec1129e102',
        mosaic: '06c2f1c8648179a8cc813fd02a202e9b502c5994948a241fb1ba18a301f9785b',
        paperWebGPU: '1286b203e2811383a996f475762cb266b6e7f771345474f0613eaaaf38bfa858'
    }]
])

export function hostGpuInventory() {
    if (process.platform !== 'darwin') return []
    const report = JSON.parse(execFileSync('system_profiler', ['SPDisplaysDataType', '-json'], {
        encoding: 'utf8', timeout: 10000
    }))
    return (report.SPDisplaysDataType ?? []).map(device => ({
        model: device.sppci_model, vendor: device.spdisplays_vendor
    }))
}

export function correctiveBaselines(identity) {
    const model = identity?.renderer === 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'
        ? 'Apple M2' : identity?.renderer === 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)'
            ? 'Apple M4' : undefined
    const host = identity?.hostGpus
    if (identity?.vendor !== 'apple' || identity?.architecture !== 'metal-3' ||
        identity?.device !== '0x0000' || identity?.description !== model || !BASELINES.has(identity?.renderer) ||
        !Array.isArray(host) || host.length !== 1 || host[0]?.model !== model ||
        host[0]?.vendor !== 'sppci_vendor_Apple') {
        throw new Error(`Unsupported GPU for exact corrective pixel baselines: ${JSON.stringify(identity)}`)
    }
    return BASELINES.get(identity.renderer)
}
