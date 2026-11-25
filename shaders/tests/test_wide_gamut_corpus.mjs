// The wide-gamut regression corpus list (shaders/tests/fixtures/wide-gamut/corpus.json)
// and its baselines agree: every listed case has its baseline, and every baseline
// belongs to a listed case.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const corpusDir = path.join(repoRoot, 'shaders/tests/fixtures/wide-gamut')
const readJson = file => JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'))
const exists = file => fs.existsSync(path.join(repoRoot, file))
const rel = file => path.relative(repoRoot, file).split(path.sep).join('/')
const walk = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [rel(path.join(dir, entry.name))]) : []

const corpus = readJson('shaders/tests/fixtures/wide-gamut/corpus.json')
const canvas = readJson('shaders/tests/fixtures/wide-gamut/canvas-bytes.json')
const RECORD_FIELDS = ['source', 'edition', 'engineBuild', 'dependencies', 'seeds', 'assets', 'inputs', 'renderSettings', 'proves']

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, file))).digest('hex')
const group = entry => entry.id.split('/')[0]

test('the corpus names its commit, its recording GPU and the content of its program lists', () => {
    assert.match(corpus.W, /^[0-9a-f]{40}$/)
    assert.equal(typeof corpus.recordingGpu, 'string')
    assert.ok(corpus.recordingGpu.length > 0)
    for (const name of ['curated', 'classic', 'basics']) assert.match(corpus.sources.programLists[name], /^[0-9a-f]{64}$/)
    assert.equal(new Set(corpus.cases.map(entry => entry.id)).size, corpus.cases.length, 'case ids are unique')
})

test('the corpus names no detail of a private repository', () => {
    for (const file of walk(corpusDir)) {
        const text = fs.readFileSync(path.join(repoRoot, file), 'utf8')
        assert.doesNotMatch(text, /noisefactorllc\/noisedeck\b/, `${file} names no private repository`)
        assert.doesNotMatch(text, /app\/js\//, `${file} names no path of a private repository`)
        for (const [hex] of text.matchAll(/\b[0-9a-f]{40}\b/g)) assert.equal(hex, corpus.W, `${file} names no commit or blob but W`)
    }
})

test('each group of the corpus keeps the size it had at W', () => {
    const counts = {}
    for (const entry of [...corpus.cases, ...corpus.excluded]) counts[group(entry)] = (counts[group(entry)] ?? 0) + 1
    assert.deepEqual(counts, corpus.counts)
})

test('every listed case has its case, its record and a baseline for each comparison', () => {
    const gpu = corpus.recordingGpu
    for (const entry of corpus.cases) {
        assert.ok(entry.comparison.length > 0, `${entry.id} names how it is compared`)
        assert.ok(exists(entry.case), `${entry.id}: ${entry.case} exists`)
        // A recorded case or pin case must be the one its baseline came from; a test's baseline is that it passes.
        if (!entry.comparison.includes('test')) assert.equal(sha256(entry.case), entry.caseSha256, `${entry.id}: ${entry.case} is the case its baseline was recorded from`)
        for (const field of RECORD_FIELDS) assert.ok(field in entry.record, `${entry.id} records ${field}`)
        assert.equal(entry.record.engineBuild, corpus.W, `${entry.id} is recorded at W`)
        for (const comparison of entry.comparison) {
            const baseline = entry.baselines?.[comparison]
            assert.ok(baseline, `${entry.id} has a ${comparison} baseline`)
            if (comparison === 'surface-pin' || comparison === 'scene-pin') {
                assert.ok(exists(baseline), `${entry.id}: ${baseline} exists`)
                const pin = readJson(baseline)
                assert.equal(pin.case, entry.case, `${baseline} is the pin of ${entry.case}`)
                for (const backend of entry.backends) assert.match(pin.baselines?.[gpu]?.[backend]?.sha256 ?? '', /^[0-9a-f]{64}$/, `${entry.id} has a ${backend} pin on the recording GPU`)
            } else if (comparison === 'canvas-bytes') {
                for (const backend of entry.backends) {
                    const frame = canvas.baselines?.[gpu]?.[entry.case]?.[backend]
                    assert.match(frame?.sha256 ?? '', /^[0-9a-f]{64}$/, `${entry.id} has ${backend} canvas bytes on the recording GPU`)
                    assert.equal(frame.method, backend === 'webgl2' ? 'readPixels' : 'toBlob', `${entry.id} reads its ${backend} canvas as design 4.6 says`)
                }
            } else if (comparison === 'test') {
                assert.match(entry.command, new RegExp(entry.case.split('/').at(-1).replace(/[.]/g, '\\.')), `${entry.id} runs its test`)
            } else {
                assert.fail(`${entry.id}: unknown comparison ${comparison}`)
            }
        }
    }
})

test('every baseline belongs to a listed case', () => {
    const pins = new Set(corpus.cases.flatMap(entry => [entry.baselines?.['surface-pin']].filter(Boolean)))
    for (const file of walk(path.join(corpusDir, 'pins'))) assert.ok(pins.has(file), `${file} is the baseline of a listed case`)
    const scenePins = new Set(corpus.cases.flatMap(entry => [entry.baselines?.['scene-pin']].filter(Boolean)))
    for (const file of walk(path.join(repoRoot, 'shaders/tests/pin-baselines'))) assert.ok(scenePins.has(file), `${file} is a listed scene pin`)
    const listed = new Set(corpus.cases.filter(entry => entry.comparison.includes('canvas-bytes')).map(entry => entry.case))
    for (const [gpu, entries] of Object.entries(canvas.baselines ?? {})) {
        for (const caseFile of Object.keys(entries)) assert.ok(listed.has(caseFile), `canvas bytes of ${caseFile} on ${gpu} belong to a listed case`)
    }
})

test('the curated programs, the demo scenes and the cases that read media keep their canvas bytes', () => {
    for (const entry of corpus.cases) {
        const media = entry.case.endsWith('/parity-case.json') && (readJson(entry.case).textureInputs ?? []).length > 0
        if (group(entry) === 'curated' || group(entry) === 'scene-demo' || media) {
            assert.ok(entry.comparison.includes('canvas-bytes'), `${entry.id} is compared by canvas bytes`)
        }
    }
    assert.ok(corpus.cases.some(entry => group(entry) === 'scene-demo'), 'the demo scenes are listed')
})

test('every generated case file is listed, or excluded with its reason and no baseline', () => {
    const listed = new Set(corpus.cases.map(entry => entry.case))
    const excluded = new Map(corpus.excluded.map(entry => [entry.case, entry]))
    for (const file of walk(path.join(corpusDir, 'cases'))) {
        assert.ok(listed.has(file) || excluded.has(file), `${file} is listed or excluded`)
    }
    for (const entry of corpus.excluded) {
        assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0, `${entry.case} is excluded with its reason`)
        assert.ok(!listed.has(entry.case), `${entry.case} is not both listed and excluded`)
    }
})

test('the half-precision rounding is IEEE 754 round to nearest, ties to even', async () => {
    const { toHalf } = await import('../scripts/wide-gamut-corpus.mjs')
    assert.equal(toHalf(1), 1)
    assert.equal(toHalf(0.5), 0.5)
    assert.equal(toHalf(1 + 2 ** -11), 1, 'a tie goes to the even neighbor')
    assert.equal(toHalf(1 + 3 * 2 ** -11), 1 + 2 ** -9, 'a tie goes to the even neighbor')
    assert.equal(toHalf(0.1), 0.0999755859375)
    assert.equal(toHalf(2 ** -24), 2 ** -24, 'the smallest subnormal')
    assert.equal(toHalf(2 ** -26), 0)
    assert.equal(toHalf(65504), 65504)
    assert.equal(toHalf(65520), Infinity)
    assert.equal(toHalf(-0.333), -toHalf(0.333))
    if (typeof globalThis.Float16Array === 'function') {
        const reference = new globalThis.Float16Array(1)
        for (let i = 0; i <= 200000; i++) {
            const v = i / 100000 - 0.5
            reference[0] = v
            assert.equal(toHalf(v), reference[0], `the rounding of ${v}`)
        }
    }
})

test('the banding measurement converts sRGB to Display P3, and back', async () => {
    const { CANVAS_QUANTIZERS, p3RoundTrip, frameBanding } = await import('../scripts/wide-gamut-corpus.mjs')
    const eight = CANVAS_QUANTIZERS.rgba8unorm, sixteen = CANVAS_QUANTIZERS.rgba16float
    for (const level of [0, 1, 64, 128, 255]) assert.equal(p3RoundTrip([level, level, level], eight).error, 0, 'a gray keeps its value')
    // sRGB red inside P3, at the P3 code that 8 bits give it.
    assert.deepEqual(p3RoundTrip([255, 0, 0], eight).p3.map(v => Math.round(v * 255)), [234, 51, 35])
    // A low channel beside a high one loses steps in 8 bits, not in 16.
    assert.deepEqual(p3RoundTrip([10, 236, 144], eight), { p3: [108 / 255, 233 / 255, 152 / 255], back: [1, 236, 144], error: 9 })
    assert.ok(p3RoundTrip([10, 236, 144], sixteen).error <= 1)
    // sRGB (255, 0, 0) and (255, 1, 0) share one 8-bit P3 code, which is banding.
    const frame = frameBanding(Uint8Array.from([255, 0, 0, 255, 255, 1, 0, 255, 10, 236, 144, 255, 0, 0, 0, 128]))
    assert.equal(frame.colors, 3, 'translucent pixels are left out')
    assert.equal(frame.formats.rgba8unorm.maxError, 9)
    assert.equal(frame.formats.rgba8unorm.mergedColors, 1)
    assert.deepEqual(frame.formats.rgba16float, { maxError: 1, colorsOverOne: 0, mergedColors: 0 })
})

test('compareP3Frame converts a display-p3 copy back to sRGB and compares it as each backend reads the srgb canvas', async () => {
    const { compareP3Frame } = await import('../scripts/wide-gamut-corpus.mjs')
    const { presentDisplayP3 } = await import('../src/runtime/display-p3-conversion.js')
    // Two pixels, top row first: an opaque color, and the same color at half alpha.
    const color = [128, 64, 255]
    const opaque = presentDisplayP3([...color.map(c => c / 255), 1])
    const translucent = presentDisplayP3([...color.map(c => c / 510), 0.5])
    const p3 = [...opaque, ...translucent]
    // WebGPU: toBlob, unpremultiplied, top-down.
    const webgpu = compareP3Frame({ srgb: [...color, 255, ...color, 128], p3, backend: 'webgpu', width: 1, height: 2 })
    assert.deepEqual([webgpu.opaque.pixels, webgpu.opaque.maxError, webgpu.translucent.pixels, webgpu.alphaMaxError], [1, 0, 1, 0])
    assert.ok(webgpu.translucent.maxError <= 1)
    // WebGL2: readPixels, premultiplied, bottom-up.
    const premultiplied = color.map(c => Math.round(c * 128 / 255))
    const webgl2 = compareP3Frame({ srgb: [...premultiplied, 128, ...color, 255], p3, backend: 'webgl2', width: 1, height: 2 })
    assert.deepEqual([webgl2.opaque.pixels, webgl2.opaque.maxError, webgl2.translucent.pixels], [1, 0, 1])
    assert.ok(webgl2.translucent.maxError <= 1)
    // On WebGL2, a colored pixel at alpha 0 is compared on its converted color.
    const glow = compareP3Frame({ srgb: [77, 51, 26, 0], p3: presentDisplayP3([77 / 255, 51 / 255, 26 / 255, 0]), backend: 'webgl2', width: 1, height: 1 })
    assert.deepEqual([glow.zeroAlpha.pixels, glow.zeroAlpha.maxError], [1, 0])
    const dropped = compareP3Frame({ srgb: [77, 51, 26, 0], p3: [0, 0, 0, 0], backend: 'webgl2', width: 1, height: 1 })
    assert.deepEqual([dropped.zeroAlpha.pixels, dropped.zeroAlpha.maxError], [1, 77], 'a dropped color is seen')
    // An alpha below half an 8-bit step: the srgb byte is 0, and the copy is premultiplied as for any alpha.
    const faint = compareP3Frame({ srgb: [77, 0, 0, 0], p3: presentDisplayP3([77 / 255, 0, 0, 1e-4]), backend: 'webgl2', width: 1, height: 1 })
    assert.deepEqual([faint.zeroAlpha.pixels, faint.zeroAlpha.maxError], [1, 0])
    // A reference two steps away counts as over one; a transparent pixel is compared on alpha only.
    const off = compareP3Frame({ srgb: [color[0] + 2, color[1], color[2], 255, 9, 9, 9, 0], p3: [...opaque, 0, 0, 0, 0], backend: 'webgpu', width: 1, height: 2 })
    assert.deepEqual([off.opaque.maxError, off.opaque.overOne, off.translucent.pixels, off.alphaMaxError], [2, 1, 0, 0])
})

test('roundTripExcesses names each frozen round-trip bound a summary exceeds, and refuses NaN and an empty run', async () => {
    const { ROUND_TRIP_BOUNDS, roundTripExcesses } = await import('../scripts/wide-gamut-corpus.mjs')
    const summary = (backend, b, step = 0, { failed = 0, frames = 1 } = {}) => ({
        backend, failed, frames,
        opaque: { maxError: b.opaque + step },
        translucent: { maxError: b.translucent + step, maxPremultipliedError: b.translucentPremultiplied + step },
        overAlpha: { maxError: b.overAlpha + step },
        zeroAlpha: { maxError: b.zeroAlpha + step },
        alphaMaxError: b.alpha + step,
    })
    for (const backend of ['webgl2', 'webgpu']) {
        const b = ROUND_TRIP_BOUNDS[backend]
        assert.deepEqual(roundTripExcesses(summary(backend, b)), [], `${backend} at its bounds`)
        assert.equal(roundTripExcesses(summary(backend, b, 1, { failed: 2 })).length, 7)
        assert.equal(roundTripExcesses(summary(backend, b, NaN)).length, 6, 'NaN exceeds every bound')
        assert.deepEqual(roundTripExcesses(summary(backend, b, 0, { frames: 0 })), [`${backend}: no frame was compared`])
    }
    assert.deepEqual(ROUND_TRIP_BOUNDS.webgl2, { opaque: 1, translucent: 1, translucentPremultiplied: 1, overAlpha: 1, zeroAlpha: 1, alpha: 0 })
})

test('checkReference passes the Display P3 frame of a reference program, and refuses a clamped or a wrong one', async () => {
    const { P3_REFERENCE_CASES, checkReference } = await import('../scripts/wide-gamut-corpus.mjs')
    const red = P3_REFERENCE_CASES.find(reference => reference.id === 'reference/p3-red')
    const frameOf = (rgb, alpha = 1) => {
        const floats = [], displaySpace = []
        for (let i = 0; i < 4; i++) {
            floats.push(...rgb.map(c => c * alpha), alpha)
            displaySpace.push(...rgb.map(c => Math.round(c * 255)), Math.round(alpha * 255))
        }
        return { floats, displaySpace, width: 2, height: 2 }
    }
    const passed = checkReference(red, frameOf([1, 0, 0]))
    assert.deepEqual([passed.ok, passed.outsideSrgb], [true, true])
    // A translucent frame fails, in the canvas copy and in the display-space read.
    const translucentCopy = frameOf([1, 0, 0], 0.5)
    for (let i = 3; i < translucentCopy.displaySpace.length; i += 4) translucentCopy.displaySpace[i] = 255
    const copyResult = checkReference(red, translucentCopy)
    assert.equal(copyResult.ok, false)
    assert.ok(Math.abs(copyResult.canvasCopyMaxError - 0.5) < 1e-9, 'the canvas copy alpha is checked')
    assert.equal(copyResult.displaySpaceMaxError, 0)
    const translucentRead = frameOf([1, 0, 0])
    for (let i = 3; i < translucentRead.displaySpace.length; i += 4) translucentRead.displaySpace[i] = 128
    assert.equal(checkReference(red, translucentRead).ok, false)
    // sRGB red in Display P3 is inside sRGB: the declared program was clamped.
    const clamped = checkReference(red, frameOf([0.9175, 0.2003, 0.1386]))
    assert.deepEqual([clamped.ok, clamped.outsideSrgb], [false, false])
    const undeclared = P3_REFERENCE_CASES.find(reference => reference.id === 'reference/p3-red-undeclared')
    assert.equal(checkReference(undeclared, frameOf(undeclared.expected[0])).ok, true)
    assert.equal(checkReference(undeclared, frameOf([1, 0, 0])).ok, false)
    // A display-space read off by more than one step, or missing, fails.
    const off = frameOf([1, 0, 0])
    off.displaySpace[1] = 3
    assert.equal(checkReference(red, off).ok, false)
    assert.equal(checkReference(red, { ...frameOf([1, 0, 0]), displaySpace: undefined }).ok, false)
    // A NaN in the canvas copy fails.
    const nan = frameOf([1, 0, 0])
    nan.floats[0] = NaN
    assert.equal(checkReference(red, nan).ok, false)
})

test('the photo reference expects the Display P3 color of each column, and referenceFailures names a failed or a missing program', async () => {
    const { P3_REFERENCE_CASES, checkReference, referenceFailures } = await import('../scripts/wide-gamut-corpus.mjs')
    const photo = P3_REFERENCE_CASES.find(reference => reference.id === 'reference/p3-photo')
    const floats = photo.expected.flatMap(rgb => [...rgb, 1])
    const displaySpace = photo.expected.flatMap(rgb => [...rgb.map(c => Math.round(c * 255)), 255])
    assert.equal(checkReference(photo, { floats, displaySpace, width: 5, height: 1 }).ok, true)
    assert.equal(checkReference(photo, { floats: [...floats.slice(4), ...floats.slice(0, 4)], displaySpace, width: 5, height: 1 }).ok, false)
    const ids = P3_REFERENCE_CASES.map(reference => reference.id)
    const ok = id => ({ id, ok: true, canvasCopyMaxError: 0, displaySpaceMaxError: 0, outsideSrgb: true })
    assert.deepEqual(referenceFailures({ referenceIds: ids, references: ids.map(ok) }), [])
    assert.equal(referenceFailures({ referenceIds: ids, references: ids.slice(1).map(ok) }).length, 1)
    assert.match(referenceFailures({ referenceIds: ids, references: ids.map(id => ({ ...ok(id), ok: id !== ids[0] })) })[0], /failed: reference\/p3-red /)
})

