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
