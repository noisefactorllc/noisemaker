import assert from 'node:assert/strict'
import { correctiveBaselines } from './corrective_baselines.js'

const gpu = (renderer, model) => ({ renderer, vendor: 'apple', architecture: 'metal-3', device: '0x0000', description: model, hostGpus: [{ model, vendor: 'sppci_vendor_Apple' }] })
const m2 = correctiveBaselines(gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'))
assert.equal(m2.mosaic, '662262ed0c4723f20802e300bd2f6637cea6d71b9fbc38bb562a89f94f25ac3d')
assert.equal(m2.plasticDefault, 'c2dd9c18ec53919f94c921968dc3af3f0127acb5dd9bf817bb7975aaecccd8c3')
assert.equal(m2.halftoneLine, '842b9a9d8176638ead50666b3f97b0756ab403e129fe46ad007f57c4626bd2ce')
assert.equal(m2.paperWebGPU, 'c7b10f508852415ffb5b947f615b323749530aab1bf0815d4705c92f4c0b6dd6')
const m4 = correctiveBaselines(gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)', 'Apple M4'))
assert.equal(m4.mosaic, '06c2f1c8648179a8cc813fd02a202e9b502c5994948a241fb1ba18a301f9785b')
assert.equal(m4.plasticDefault, 'a2553a928da58a3a8513306d6c2b9420bf31eef4fdb51687e8dc1b9c6e2f3ccc')
assert.equal(m4.halftoneLine, 'ca2097ced765d7e77eaf1904c9f2932892115d4b03974cdad92a94ec1129e102')
assert.equal(m4.paperWebGPU, '1286b203e2811383a996f475762cb266b6e7f771345474f0613eaaaf38bfa858')
for (const unknown of [
    gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)'),
    gpu('unknown'),
    { ...gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'), vendor: 'unknown' },
    { ...gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'), architecture: 'metal-4' },
    { ...gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'), device: 'unverified-other-device' },
    { ...gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'), description: 'unverified-other-device' },
    { ...gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'), hostGpus: [] },
    { ...gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'), hostGpus: [{ model: 'Apple M4', vendor: 'sppci_vendor_Apple' }] },
    { ...gpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'), hostGpus: [{ model: 'Apple M2', vendor: 'sppci_vendor_Apple' }, { model: 'Other', vendor: 'other' }] },
    {}, null
]) {
    assert.throws(() => correctiveBaselines(unknown), /Unsupported GPU/, 'unknown hardware fails closed')
}
console.log('Corrective pixel baseline selection passed')
