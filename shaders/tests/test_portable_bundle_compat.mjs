// The delivered bundle contract, checked on the dist/ that
// `npm run bundle:shaders` built, against the release the catalog baseline
// records (shaders/tests/fixtures/portable/catalog-baseline.json reference).
//
// The reference release is read from its delivery URL. Its SHA256SUMS must
// have the digest that shaders/tests/fixtures/portable/reference-release.json
// pins, and each file read from it must have the digest SHA256SUMS lists. A
// read that fails fails the test: nothing is skipped, and nothing is rebuilt
// from source.
//
// Each comparison is made after the baseline's explainedDifferences: an effect
// added or removed since the reference release is compared on neither side.
// For each effect, the candidate bundle has the reference bundle's export
// names and default type and no runtime load the reference bundle does not
// make. The manifest, the keys of each string catalog and the delivered file
// names are the reference release's, and no generated definition.js drifts
// from its definition.json.
//
//   node --test shaders/tests/test_portable_bundle_compat.mjs
//
// NOISEMAKER_BUNDLES names another dist/ directory.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { wrapperDrift } from '../../scripts/migrate-portable-effects.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const FIXTURES = path.join(ROOT, 'shaders/tests/fixtures/portable')
const BASELINE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'catalog-baseline.json'), 'utf8'))
const REFERENCE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'reference-release.json'), 'utf8'))
const DIST = path.resolve(process.env.NOISEMAKER_BUNDLES ?? path.join(ROOT, 'dist'))

// The loads a bundle can make at run time.
const RUNTIME_LOADS = /\bfetch\s*\(|\bimport\s*\(|\bimportScripts\s*\(|\bnew\s+Worker\s*\(|\bXMLHttpRequest\b|\bfrom\s*["'][^"']+["']/g

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

// A read of the reference release that stalls fails, as one that errs does.
const FETCH_TIMEOUT_MS = 60_000

/** The SHA256SUMS lines as a map of path to digest. */
export function parseSums(text) {
    const sums = new Map()
    for (const line of text.split('\n')) {
        const match = /^([0-9a-f]{64}) [ *]?(.+)$/.exec(line.trim())
        if (match) sums.set(match[2], match[1])
    }
    return sums
}

/** Where a file of the release layout is in dist/. */
export function distPath(releasePath) {
    if (releasePath.startsWith('effects/') && /^effects\/[^/]+\/[^/]+\.js$/.test(releasePath)) return path.join('effects', releasePath.slice('effects/'.length))
    return path.join('shaders', releasePath)
}

/** The runtime loads a module's text makes, counted by kind. */
export function runtimeLoads(text) {
    const counts = {}
    for (const match of text.matchAll(RUNTIME_LOADS)) {
        const kind = match[0].replace(/\s+/g, '').replace(/["'].*$/, '')
        counts[kind] = (counts[kind] ?? 0) + 1
    }
    return counts
}

/**
 * The differences between a candidate effect bundle and the reference one,
 * as messages: export names, the default export's type, and runtime loads.
 */
export function moduleProblems(id, candidate, reference) {
    const problems = []
    const keys = module => Object.keys(module).sort()
    if (JSON.stringify(keys(candidate.module)) !== JSON.stringify(keys(reference.module))) {
        problems.push(`${id}: exports ${keys(candidate.module).join(', ')}, and the reference exports ${keys(reference.module).join(', ')}`)
    }
    if (typeof candidate.module.default !== typeof reference.module.default) {
        problems.push(`${id}: its default export is a ${typeof candidate.module.default}, and the reference's is a ${typeof reference.module.default}`)
    }
    const loads = runtimeLoads(candidate.text)
    const referenceLoads = runtimeLoads(reference.text)
    for (const [kind, count] of Object.entries(loads)) {
        if (count > (referenceLoads[kind] ?? 0)) problems.push(`${id}: ${count} runtime loads of the form ${kind}, and the reference makes ${referenceLoads[kind] ?? 0}`)
    }
    return problems
}

/** The keys of a string catalog, for the compared effects. */
export function catalogKeys(catalog, compared) {
    return Object.keys(catalog).filter(key => compared.has(key.split('.')[0])).sort()
}

const explained = new Set(BASELINE.explainedDifferences.filter(entry => entry.change === 'added' || entry.change === 'removed').map(entry => entry.effectId))
const COMPARED = new Set(BASELINE.effectIds.filter(id => BASELINE.referenceEffectIds.includes(id) && !explained.has(id)))

let sums
let scratch
const reads = new Map()

async function readReference(releasePath) {
    if (!reads.has(releasePath)) {
        reads.set(releasePath, (async () => {
            const expected = sums.get(releasePath)
            assert.ok(expected, `${releasePath} is listed in the reference SHA256SUMS`)
            const response = await fetch(new URL(releasePath, REFERENCE.url), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
            assert.equal(response.status, 200, `${REFERENCE.url}${releasePath} is delivered`)
            const bytes = Buffer.from(await response.arrayBuffer())
            assert.equal(sha256(bytes), expected, `${releasePath} has the digest SHA256SUMS lists`)
            return bytes
        })())
    }
    return reads.get(releasePath)
}

async function importText(text, name) {
    const file = path.join(scratch, `${name.replace(/[^A-Za-z0-9]/g, '_')}.mjs`)
    fs.writeFileSync(file, text)
    return import(pathToFileURL(file).href)
}

before(async () => {
    assert.equal(REFERENCE.version, BASELINE.reference.version, 'the pinned release is the one the catalog baseline records')
    assert.ok(COMPARED.size > 0, 'the comparison has effects to compare')
    assert.ok(fs.existsSync(path.join(DIST, 'effects')) && fs.existsSync(path.join(DIST, 'shaders')),
        `${DIST} holds the effects/ and shaders/ that npm run bundle:shaders builds`)
    const response = await fetch(new URL('SHA256SUMS', REFERENCE.url), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    assert.equal(response.status, 200, `${REFERENCE.url}SHA256SUMS is delivered`)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(sha256(bytes), REFERENCE.sha256sums, 'the reference SHA256SUMS has its pinned digest')
    sums = parseSums(bytes.toString('utf8'))
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-compat-'))
})

after(() => {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true })
})

test('the comparison reports a changed export, default type, runtime load and string key', () => {
    const reference = { module: { default: {}, effectId: 'a/b', help: '' }, text: 'export{}' }
    assert.deepEqual(moduleProblems('a/b', { module: { ...reference.module }, text: reference.text }, reference), [])
    assert.match(moduleProblems('a/b', { module: { default: {}, effectId: 'a/b' }, text: '' }, reference)[0], /exports default, effectId/)
    assert.match(moduleProblems('a/b', { module: { default() {}, effectId: 'a/b', help: '' }, text: '' }, reference)[0], /default export is a function/)
    assert.match(moduleProblems('a/b', { module: reference.module, text: 'fetch("x.json")' }, reference)[0], /runtime loads of the form fetch\(/)
    assert.match(moduleProblems('a/b', { module: reference.module, text: 'import x from "./helper.js"' }, reference)[0], /form from/)
    assert.deepEqual(catalogKeys({ 'a/b.x': 1, 'c/d.y': 1 }, new Set(['a/b'])), ['a/b.x'])
    assert.deepEqual(distPath('effects/synth/noise.js'), path.join('effects', 'synth/noise.js'))
    assert.deepEqual(distPath('effects/manifest.json'), path.join('shaders', 'effects/manifest.json'))
    assert.deepEqual(distPath('noisemaker-shaders-core.esm.js'), path.join('shaders', 'noisemaker-shaders-core.esm.js'))
})

test('the bundle delivers every file of the reference release under the same name', () => {
    const missing = []
    for (const releasePath of sums.keys()) {
        // The release workflow writes deployment-meta.json, not the bundle.
        if (releasePath === 'deployment-meta.json') continue
        const effect = /^effects\/([^/]+\/[^/]+)\.js$/.exec(releasePath)?.[1]
        if (effect && !COMPARED.has(effect)) continue
        if (!fs.existsSync(path.join(DIST, distPath(releasePath)))) missing.push(releasePath)
    }
    assert.deepEqual(missing, [])
    const delivered = [...sums.keys()].map(file => /^effects\/([^/]+\/[^/]+)\.js$/.exec(file)?.[1]).filter(Boolean).filter(id => COMPARED.has(id))
    assert.deepEqual(delivered.sort(), [...COMPARED].sort(), 'the reference release delivers each compared effect')
})

test('each effect bundle has the reference bundle\'s exports and default type, and no new runtime load', async () => {
    const problems = []
    const ids = [...COMPARED].sort()
    for (let index = 0; index < ids.length; index += 8) {
        await Promise.all(ids.slice(index, index + 8).map(async id => {
            const releasePath = `effects/${id}.js`
            const referenceText = (await readReference(releasePath)).toString('utf8')
            const candidateText = fs.readFileSync(path.join(DIST, distPath(releasePath)), 'utf8')
            problems.push(...moduleProblems(id,
                { module: await importText(candidateText, `candidate-${id}`), text: candidateText },
                { module: await importText(referenceText, `reference-${id}`), text: referenceText }))
        }))
    }
    assert.deepEqual(problems.sort(), [])
})

test('the manifest and the keys of each string catalog are the reference release\'s', async () => {
    const compared = object => Object.fromEntries(Object.entries(object).filter(([id]) => COMPARED.has(id)))
    const referenceManifest = JSON.parse((await readReference('effects/manifest.json')).toString('utf8'))
    const candidateManifest = JSON.parse(fs.readFileSync(path.join(DIST, distPath('effects/manifest.json')), 'utf8'))
    assert.deepEqual(compared(candidateManifest), compared(referenceManifest))
    const catalogs = [...sums.keys()].filter(file => /^effects\/strings\.[\w-]+\.json$/.test(file))
    assert.ok(catalogs.length > 0, 'the reference release delivers string catalogs')
    for (const catalog of catalogs) {
        const referenceKeys = catalogKeys(JSON.parse((await readReference(catalog)).toString('utf8')), COMPARED)
        const candidateKeys = catalogKeys(JSON.parse(fs.readFileSync(path.join(DIST, distPath(catalog)), 'utf8')), COMPARED)
        assert.deepEqual(candidateKeys, referenceKeys, catalog)
    }
})

test('no generated definition.js drifts from its definition.json', () => {
    assert.deepEqual(wrapperDrift().map(entry => entry.effectId), [])
})
