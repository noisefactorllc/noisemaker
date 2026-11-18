/**
 * Pin baselines are keyed by GPU: a baseline file holds one entry for each
 * GPU it was recorded on, and a GPU with no entry is refused.
 *
 * This checks the lookup and the recording in shaders/scripts/pin-baselines.mjs,
 * and that the committed cases and baselines belong together. It renders
 * nothing; `npm run test:shaders:pins` compares rendered output.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { baselineForGpu, withGpuBaseline } from '../scripts/pin-baselines.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const caseDir = path.join(repoRoot, 'shaders', 'tests', 'pin-cases')
const baselineDir = path.join(repoRoot, 'shaders', 'tests', 'pin-baselines')

const M2 = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'
const M4 = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)'
const frame = (sha256) => ({ surface: 'global_o0', width: 4, height: 4, nonzeroRgbPixels: 16, uniqueColors: 2, sha256 })
const pin = (gpu, a, b) => ({ case: 'shaders/tests/pin-cases/example.json', resolution: [4, 4], gpu, webgl2: frame(a), webgpu: frame(b) })

// --- Lookup ---

const recorded = withGpuBaseline(null, pin(M4, 'a'.repeat(64), 'b'.repeat(64)))
assert.deepEqual(Object.keys(recorded), ['case', 'resolution', 'baselines'])
assert.equal(baselineForGpu(recorded, M4).webgl2.sha256, 'a'.repeat(64))
assert.equal(baselineForGpu(recorded, M4).webgpu.sha256, 'b'.repeat(64))

assert.throws(() => baselineForGpu(recorded, M2), (error) => {
    assert.match(error.message, /No pin baseline for this GPU/)
    assert.ok(error.message.includes(M2), 'the refusal names the GPU that has no entry')
    assert.ok(error.message.includes(M4), 'the refusal names the GPUs the file lists')
    return true
}, 'a GPU with no entry is refused')
assert.throws(() => baselineForGpu(recorded, ''), /could not be identified/, 'an unidentified GPU is refused')
assert.throws(() => baselineForGpu({ case: 'x', resolution: [4, 4], webgl2: frame('c'.repeat(64)) }, M4),
    /No pin baseline for this GPU/, 'a file with no GPU entries is refused')

// --- Recording ---

const both = withGpuBaseline(recorded, pin(M2, 'c'.repeat(64), 'd'.repeat(64)))
assert.deepEqual(Object.keys(both.baselines).sort(), [M2, M4].sort(), 'recording one GPU keeps the other')
assert.equal(baselineForGpu(both, M4).webgl2.sha256, 'a'.repeat(64))
assert.equal(baselineForGpu(both, M2).webgl2.sha256, 'c'.repeat(64))

const rerecorded = withGpuBaseline(both, pin(M4, 'e'.repeat(64), 'f'.repeat(64)))
assert.equal(baselineForGpu(rerecorded, M4).webgl2.sha256, 'e'.repeat(64), 'recording a GPU again replaces its entry')
assert.equal(baselineForGpu(rerecorded, M2).webgl2.sha256, 'c'.repeat(64))

const otherResolution = withGpuBaseline(both, { ...pin(M4, 'e'.repeat(64), 'f'.repeat(64)), resolution: [8, 8] })
assert.deepEqual(Object.keys(otherResolution.baselines), [M4], 'entries recorded at another resolution are dropped')
const otherCase = withGpuBaseline(both, { ...pin(M4, 'e'.repeat(64), 'f'.repeat(64)), case: 'shaders/tests/pin-cases/other.json' })
assert.deepEqual(Object.keys(otherCase.baselines), [M4], 'entries recorded for another case are dropped')
assert.throws(() => withGpuBaseline(null, pin('', 'a'.repeat(64), 'b'.repeat(64))), /could not be identified/)

// --- The committed cases and baselines ---

const caseNames = fs.readdirSync(caseDir).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, '')).sort()
const baselineNames = fs.readdirSync(baselineDir).filter((file) => file.endsWith('.pin.json')).map((file) => file.replace(/\.pin\.json$/, '')).sort()
assert.ok(caseNames.length > 0, 'there is at least one pin case')
assert.deepEqual(baselineNames, caseNames, 'every pin case has a baseline file, and every baseline file has a case')

for (const name of caseNames) {
    const pinCase = JSON.parse(fs.readFileSync(path.join(caseDir, `${name}.json`), 'utf8'))
    const baseline = JSON.parse(fs.readFileSync(path.join(baselineDir, `${name}.pin.json`), 'utf8'))
    assert.equal(baseline.case, `shaders/tests/pin-cases/${name}.json`, `${name}: the baseline names its case`)
    assert.deepEqual(baseline.resolution, pinCase.resolution, `${name}: the baseline was recorded at the case's resolution`)
    const gpus = Object.keys(baseline.baselines ?? {})
    assert.ok(gpus.length > 0, `${name}: the baseline lists at least one GPU`)
    for (const gpu of gpus) {
        for (const backend of ['webgl2', 'webgpu']) {
            assert.match(baseline.baselines[gpu][backend]?.sha256 ?? '', /^[0-9a-f]{64}$/, `${name}: ${gpu} has a ${backend} hash`)
        }
    }
}

// A scene case pins the settled frame: one of the demo scenes is still
// changing after its first renders.
const sceneCases = caseNames.filter((name) => name.startsWith('scene-'))
assert.ok(sceneCases.length > 0, 'the pins cover scene output')
for (const name of sceneCases) {
    const pinCase = JSON.parse(fs.readFileSync(path.join(caseDir, `${name}.json`), 'utf8'))
    assert.ok(pinCase.settleMs > 0, `${name}: a scene case waits for the frame to settle`)
}

// The demo scenes are pinned as the demo ships them.
for (const scene of ['hello-engine', 'materials-lab']) {
    const pinCase = JSON.parse(fs.readFileSync(path.join(caseDir, `scene-${scene}.json`), 'utf8'))
    const demo = fs.readFileSync(path.join(repoRoot, 'demo', 'shaders', 'scenes', `${scene}.dsl`), 'utf8')
    assert.equal(pinCase.dsl, demo, `scene-${scene}: the case pins demo/shaders/scenes/${scene}.dsl as written`)
}

console.log(`test_pin_baselines: ${caseNames.length} pin cases, ${sceneCases.length} of them scenes; lookup and recording by GPU verified`)
