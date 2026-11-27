import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import {
    BASELINE_RELATIVE, REPO_ROOT, RENDER_CASES_RELATIVE, WAVES_RELATIVE,
    describeCase, firstDifference, loadCatalog,
} from '../../scripts/audit-portable-migration.mjs'
import { EFFECTS_ROOT, readPortableCatalog } from '../../scripts/lib/portable-catalog.mjs'
import { wrapperDrift } from '../../scripts/migrate-portable-effects.mjs'

const ORDER = ['A', 'B', 'C', 'D', 'E']
const A1 = [
    'classicNoisedeck/noise3d', 'filter/adjust', 'filter/feedback', 'filter/text',
    'mixer/blendMode', 'render/meshLoader', 'synth/remap', 'synth/solid', 'synth3d/noise3d',
]
const A = new Set([...A1, 'filter/fibers', 'render/meshRender', 'render/pointsRender', 'render/render3d', 'synth/media'])
const E = new Set(['filter/scratches', 'filter/strayHair'])
const B = new Set(['filter', 'mixer', 'synth'])
const C = new Set(['synth3d', 'filter3d', 'points', 'render'])

const readJson = relative => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'))
const LEGACY_ERROR = /definition\.json|legacy catalog|allowLegacyCatalog|native definition/i

function waveFor(id) {
    if (A.has(id)) return 'A'
    if (E.has(id)) return 'E'
    const namespace = id.split('/')[0]
    if (B.has(namespace)) return 'B'
    if (C.has(namespace)) return 'C'
    if (namespace === 'classicNoisedeck') return 'D'
    return undefined
}

function validateWaves({ waves, added, through, closed }, baseline, converted, event = 'push') {
    assert.ok(['', ...ORDER].includes(through), 'through must be empty or a wave')
    assert.ok(closed === undefined || typeof closed === 'boolean', 'closed must be boolean when present')
    assert.ok(!closed || through === 'E', 'the migration cannot close before Wave E')
    assert.deepEqual(Object.keys(waves).sort(), ORDER, 'the manifest contains exactly Waves A to E')
    assert.ok(added && typeof added === 'object' && !Array.isArray(added), 'added maps effect IDs to waves')
    const additions = new Set(baseline.explainedDifferences.filter(entry => entry.change === 'added').map(entry => entry.effectId))
    for (const [id, wave] of Object.entries(added)) {
        assert.ok(baseline.effectIds.includes(id) && additions.has(id), `${id}: added must be an explained baseline addition`)
        assert.equal(waveFor(id), undefined, `${id}: added cannot override a wave rule`)
        assert.ok(ORDER.includes(wave), `${id}: added must name a valid wave`)
    }
    const expected = Object.fromEntries(ORDER.map(wave => [wave, []]))
    for (const id of baseline.effectIds) {
        const wave = waveFor(id) ?? added[id]
        assert.ok(wave, `${id}: an effect outside the wave rules must be listed in added`)
        expected[wave].push(id)
    }
    assert.deepEqual(ORDER.flatMap(wave => waves[wave]).sort(), [...baseline.effectIds].sort(), 'every baseline ID occurs exactly once')
    assert.deepEqual(waves, expected, 'membership must equal the wave rules in baseline order')

    const last = ORDER.indexOf(through)
    const required = ORDER.slice(0, last + 1).flatMap(wave => expected[wave])
    for (const id of required) assert.ok(converted.has(id), `${id}: missing from a completed wave`)
    const limit = last + (event === 'workflow_dispatch' ? 1 : 2)
    const allowed = new Set(ORDER.slice(0, limit).flatMap(wave => expected[wave]))
    for (const id of converted) assert.ok(allowed.has(id), `${id}: conversion is ahead of through ${through || '(empty)'}`)
}

function convertedEffects() {
    return new Set(fs.readdirSync(EFFECTS_ROOT, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(namespace => {
        const root = path.join(EFFECTS_ROOT, namespace.name)
        return fs.readdirSync(root, { withFileTypes: true }).filter(effect => effect.isDirectory())
            .filter(effect => fs.existsSync(path.join(root, effect.name, 'definition.json')))
            .map(effect => `${namespace.name}/${effect.name}`)
    }))
}

test('the tracked waves match the baseline and bound the live conversion set', () => {
    const baseline = readJson(BASELINE_RELATIVE)
    const converted = convertedEffects()
    validateWaves(readJson(WAVES_RELATIVE), baseline, converted, process.env.GITHUB_EVENT_NAME)
    for (const id of A1) {
        if (baseline.effectIds.includes(id)) assert.ok(converted.has(id), `${id}: Wave A batch 1 is missing its definition.json`)
    }
})

test('the wave checks reject wrong membership, additions, boundaries and closure', () => {
    const baseline = {
        effectIds: ['classicNoisedeck/other', 'custom/added', 'filter/feedback', 'filter/other', 'filter/scratches', 'points/other'],
        explainedDifferences: [{ effectId: 'custom/added', change: 'added' }],
    }
    const manifest = {
        through: '', added: { 'custom/added': 'C' },
        waves: {
            A: ['filter/feedback'], B: ['filter/other'], C: ['custom/added', 'points/other'],
            D: ['classicNoisedeck/other'], E: ['filter/scratches'],
        },
    }
    const a = new Set(['filter/feedback'])
    validateWaves(manifest, baseline, a)
    assert.throws(() => validateWaves({ ...manifest, through: 'X' }, baseline, a), /through must be/)
    assert.throws(() => validateWaves({ ...manifest, closed: true }, baseline, a), /cannot close/)
    assert.throws(() => validateWaves({ ...manifest, added: {} }, baseline, a), /must be listed in added/)
    assert.throws(() => validateWaves({ ...manifest, added: { 'custom/added': 'X' } }, baseline, a), /valid wave/)
    assert.throws(() => validateWaves({ ...manifest, added: { ...manifest.added, 'custom/absent': 'C' } }, baseline, a), /explained baseline addition/)
    const explainedRuleId = { ...baseline, explainedDifferences: [...baseline.explainedDifferences, { effectId: 'filter/other', change: 'added' }] }
    assert.throws(() => validateWaves({ ...manifest, added: { ...manifest.added, 'filter/other': 'C' } }, explainedRuleId, a), /cannot override/)
    assert.throws(() => validateWaves({ ...manifest, waves: { ...manifest.waves, B: ['filter/feedback'] } }, baseline, a), /exactly once/)
    assert.throws(() => validateWaves({ ...manifest, waves: { ...manifest.waves, A: manifest.waves.B, B: manifest.waves.A } }, baseline, a), /membership must equal/)
    assert.throws(() => validateWaves(manifest, baseline, new Set(['filter/other'])), /conversion is ahead/)
    assert.throws(() => validateWaves({ ...manifest, through: 'A' }, baseline, new Set()), /missing from a completed wave/)
    assert.throws(() => validateWaves(manifest, baseline, a, 'workflow_dispatch'), /conversion is ahead/)
    validateWaves({ ...manifest, through: 'A' }, baseline, a, 'workflow_dispatch')
    validateWaves({ ...manifest, through: 'E', closed: true }, baseline, new Set(baseline.effectIds), 'workflow_dispatch')
})

test('converted definitions keep the source loader metadata, export kind and render-case plan inputs', async () => {
    const baseline = readJson(BASELINE_RELATIVE)
    const { cases } = readJson(RENDER_CASES_RELATIVE)
    const ids = [...convertedEffects()].sort()
    const { exportKinds, metadata } = await loadCatalog(REPO_ROOT, ids)
    const expectedKinds = new Map(baseline.exportKinds)
    assert.deepEqual(exportKinds, ids.map(id => [id, expectedKinds.get(id)]))
    for (const id of ids) {
        assert.equal(firstDifference(metadata[id], baseline.metadata[id]), null, `${id}: runtime metadata or lifecycle changed`)
        const { seeds, parameters } = await describeCase(REPO_ROOT, id, cases[id])
        assert.deepEqual(seeds, cases[id].seeds, `${id}: the render case resolves the same seeds`)
        assert.deepEqual(parameters, cases[id].parameters, `${id}: the render case resolves the same target parameters`)
    }
})

test('the migration keeps generated wrappers current and requires JSON-only discovery at Wave E', async () => {
    const baseline = readJson(BASELINE_RELATIVE)
    const manifest = readJson(WAVES_RELATIVE)
    assert.deepEqual(wrapperDrift().map(entry => entry.effectId), [], 'every native definition has its generated module')
    if (manifest.through === 'E') {
        const catalog = await readPortableCatalog()
        assert.deepEqual(catalog.map(entry => entry.effectId), baseline.effectIds)
        assert.ok(catalog.every(entry => entry.source === 'json'))
    }
})

test('the manifest generator, bundler and discovery refuse a legacy-only definition at Wave E', async () => {
    if (readJson(WAVES_RELATIVE).through !== 'E') return

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-wave-e-'))
    const load = file => import(pathToFileURL(path.join(root, file)).href)
    const id = 'synth/legacyBoundary'
    const accepted = []
    try {
        for (const part of ['scripts', 'shaders/src', 'shaders/scripts', 'shaders/tests/definition-schema.js', 'demo/shaders/lib', 'share']) {
            fs.cpSync(path.join(REPO_ROOT, part), path.join(root, part), { recursive: true })
        }
        fs.mkdirSync(path.dirname(path.join(root, WAVES_RELATIVE)), { recursive: true })
        fs.writeFileSync(path.join(root, WAVES_RELATIVE), JSON.stringify({ through: 'E', added: {}, waves: { A: [], B: [id], C: [], D: [], E: [] } }))
        fs.writeFileSync(path.join(root, BASELINE_RELATIVE), JSON.stringify({ effectIds: [id], exportKinds: [[id, 'instance']] }))
        fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
        const directory = path.join(root, 'shaders/effects', id)
        fs.mkdirSync(directory, { recursive: true })
        fs.writeFileSync(path.join(directory, 'definition.js'), 'export default { name: "Boundary fixture", namespace: "synth", func: "legacyBoundary", globals: {}, passes: [] }\n')
        fs.writeFileSync(path.join(root, 'shaders/effects/manifest.json'), JSON.stringify({ [id]: {} }))

        const { buildManifest } = await load('shaders/scripts/generate-shader-manifest.mjs')
        const { readPortableCatalog: discover } = await load('scripts/lib/portable-catalog.mjs')
        for (const [name, invoke] of [['manifest generator', buildManifest], ['discovery', discover]]) {
            for (const options of [{}, { allowLegacyCatalog: true }]) {
                try {
                    await (name === 'manifest generator' ? invoke(undefined, options) : invoke(options))
                    if (!accepted.includes(name)) accepted.push(name)
                } catch (error) {
                    assert.match(error.message, LEGACY_ERROR, `${name} must refuse legacy definitions explicitly`)
                }
            }
        }

        // Exercise the bundler's own entry point. The esbuild stub refuses to
        // generate anything if legacy input gets as far as the build stage.
        const buildReached = 'TEST REACHED ESBUILD'
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
            import { registerHooks } from 'node:module';
            import { pathToFileURL } from 'node:url';
            const url = 'data:text/javascript,' + encodeURIComponent('export function build() { throw new Error(${JSON.stringify(buildReached)}) }');
            registerHooks({ resolve(specifier, context, next) {
                return specifier === 'esbuild' ? { url, shortCircuit: true } : next(specifier, context);
            }});
            const file = process.argv[1];
            process.argv = [process.execPath, file, '--namespace', 'synth', '--effect', 'legacyBoundary'];
            await import(pathToFileURL(file).href);
        `, path.join(root, 'scripts/bundle-effects.js')], { cwd: root, encoding: 'utf8' })
        assert.ifError(child.error)
        const output = `${child.stdout}\n${child.stderr}`
        if (child.status === 0 || output.includes(buildReached)) accepted.push('bundler')
        else assert.match(output, LEGACY_ERROR, `bundler must refuse legacy definitions explicitly: ${output}`)

        assert.deepEqual(accepted, [], 'these Wave E entry points still accept legacy-only definitions')
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('the introduction of a native definition preserves its shaders and assets', () => {
    for (const id of convertedEffects()) {
        const directory = `shaders/effects/${id}`
        const run = args => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
        const introduction = run(['log', '-1', '--first-parent', '--diff-filter=A', '--format=%H', '--', `${directory}/definition.json`])
        const range = introduction ? [`${introduction}^`, introduction] : ['HEAD']
        const changed = run(['diff', '--name-only', ...range, '--', directory]).split('\n').filter(Boolean)
        if (!introduction) changed.push(...run(['ls-files', '--others', '--exclude-standard', '--', directory]).split('\n').filter(Boolean))
        const conversionFiles = new Set(['definition.json', 'definition.js', 'parity-attestation.json'].map(file => `${directory}/${file}`))
        assert.deepEqual(changed.filter(file => !conversionFiles.has(file)), [],
            `${id}: conversion also changed shader, asset or case files`)
    }
})
