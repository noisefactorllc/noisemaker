import assert from 'node:assert/strict'
import { parameterCases, compareFrames, agreementProgram, effectCases } from './agreement-cases.mjs'
import { parse, lex } from '../src/lang/index.js'
import fs from 'node:fs/promises'
import { CanvasRenderer } from '../src/renderer/canvas.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { execFileSync, spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { agreementFingerprint } from '../../scripts/lib/agreement-source.mjs'

const definition = { globals: {
    seed: { type: 'int', default: 0, min: 0, max: 100 },
    amount: { type: 'float', default: 0.25, min: -2, max: 4 },
    steps: { type: 'int', default: 2, min: 1, max: 6 },
    mode: { type: 'int', default: 0, choices: { group: null, first: 0, middle: 8, last: 64 } },
    slider: { type: 'int', default: 0, ui: { control: 'slider' } },
    direction: { type: 'vec3', default: [0, 1, 0], min: -1, max: 1 },
    tint: { type: 'vec3', default: [0, 0, 0], ui: { control: 'slider' } },
} }
const cases = parameterCases(definition)
assert.deepEqual(cases[0], { name: 'default', params: {} })
assert.ok(cases.some(c => c.params.seed === 7), 'seed sweep must catch the known boundary case')
assert.deepEqual(cases.filter(c => c.name.startsWith('amount:')).map(c => c.params),
    [{ amount: -2 }, { amount: 1 }, { amount: 4 }])
assert.deepEqual(cases.filter(c => c.name.startsWith('steps:')).map(c => c.params.steps), [1, 3, 6])
assert.deepEqual(cases.filter(c => c.name.startsWith('mode:')).map(c => c.params.mode), [0, 8, 64])
assert.deepEqual(cases.filter(c => c.name.startsWith('slider:')).map(c => c.params.slider), [0, 50, 100])
assert.ok(cases.some(c => JSON.stringify(c.params.direction) === '[0,-1,0]'), 'vector components vary independently')
assert.deepEqual(cases.filter(c => c.name.startsWith('tint:1:')).map(c => c.params.tint), [[0, -1, 0], [0, 0, 0], [0, 1, 0]], 'public vector picker bounds are part of the catalog range')
assert.ok(cases.every(c => Object.keys(c.params).length <= 1), 'other parameters stay at defaults')

const frame = values => ({ width: 2, height: 1, data: Uint8Array.from(values) })
const a = frame([10, 20, 30, 255, 40, 50, 60, 255])
const b = frame([12, 22, 32, 255, 41, 54, 65, 255])
assert.deepEqual(compareFrames(a, b), { differingPixels: 1, pixelCount: 2, fractionAbove2: 0.5, maxDifference: 5, pass: false })
assert.equal(compareFrames(a, a).pass, true)
assert.throws(() => compareFrames(a, { ...b, width: 1 }), /dimensions/)
assert.throws(() => compareFrames(a, { ...b, data: b.data.subarray(0, 4) }), /length/)
console.log('PASS agreement case coverage and pixel metrics')

for (const [id, params, expected] of [
    ['synth3d/noise3d', { seed: 7 }, { seed: { type: 'Number', value: 7 } }],
    ['render/renderLit3d', {}, {}],
    ['points/heightGrid', { heightScale: -100 }, { heightScale: { type: 'Number', value: -100 } }],
]) {
    let definition = (await import(`../effects/${id}/definition.js`)).default
    if (typeof definition === 'function') definition = new definition()
    const dsl = agreementProgram({ namespace: id.split('/')[0], instance: definition }, params)
    const ast = parse(lex(dsl))
    const calls = ast.plans.flatMap(plan => plan.chain).filter(call => call.type === 'Call' && call.name === definition.func)
    assert.equal(calls.length, 1, `${id} target executes once`)
    // An argument node also carries where it was written; the check is on what it holds.
    const numericArgs = Object.fromEntries(Object.entries(calls[0].kwargs || {}).filter(([key]) => ['int', 'float'].includes(definition.globals[key]?.type))
        .map(([key, { type, value }]) => [key, { type, value }]))
    assert.deepEqual(numericArgs, expected, `${id} demo overrides must not replace declared defaults`)
    if (id === 'points/heightGrid') assert.equal(calls[0].kwargs.heightTex.type, 'Read', 'input wiring survives')
}
console.log('PASS agreement programs preserve input wiring and target defaults')

const originalFetch = globalThis.fetch
try {
    globalThis.fetch = async url => {
        const content = await fs.readFile(new URL(url), 'utf8')
        return { ok: true, text: async () => content, json: async () => JSON.parse(content) }
    }
    const renderer = new CanvasRenderer({ basePath: new URL('../', import.meta.url).href.replace(/\/$/, '') })
    const manifest = await renderer.loadManifest()
    await renderer.loadEffects(Object.keys(manifest))
    for (const id of Object.keys(manifest)) {
        const effect = renderer.loadedEffects.get(id)
        const planned = effectCases(effect)
        if (id === 'synth/remap') assert.ok(planned.some(c => c.name === 'active-input' && c.dsl === effect.instance.defaultProgram), 'remap needs its populated input fixture beside default cases')
        for (const c of planned) {
            const graph = compileGraph(c.dsl)
            assert.ok(graph.passes.some(pass => pass.effectKey === id.replace('/', '.')), `${id}/${c.name} target must execute`)
        }
    }
    console.log('PASS every catalog case compiles with its target effect')
} finally {
    globalThis.fetch = originalFetch
}

const badSelection = spawnSync(process.execPath, ['scripts/cross-backend-agreement.mjs', '--list', '--effects', 'synth3d/noise3d', '--cases', 'default,seed:77'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' })
assert.notEqual(badSelection.status, 0, 'an unknown requested case cannot silently disappear')
assert.match(badSelection.stderr, /No cases match seed:77/)

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'agreement-source-'))
try {
    const git = args => execFileSync('git', args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    git(['init', '--initial-branch=main'])
    await fs.mkdir(path.join(fixture, 'shaders/src'), { recursive: true })
    await fs.mkdir(path.join(fixture, 'share'))
    const sourcePath = path.join(fixture, 'shaders/src/fixture.js')
    await fs.writeFile(sourcePath, 'export const value = 1\n')
    const palettesPath = path.join(fixture, 'share/palettes.json')
    await fs.writeFile(palettesPath, '{}\n')
    const configured = key => spawnSync('git', ['config', '--global', key], { encoding: 'utf8' }).stdout.trim()
    // Disposable fixture commits also run in CI, where no author is configured.
    const identity = ['-c', `user.name=${configured('user.name') || 'Agreement fixture'}`, '-c', `user.email=${configured('user.email') || 'fixture@example.invalid'}`]
    git(['add', 'shaders/src/fixture.js', 'share/palettes.json'])
    git([...identity, 'commit', '-m', 'TEST: source fingerprint fixture'])
    const before = await agreementFingerprint(fixture)
    await fs.writeFile(path.join(fixture, 'agreement-results.jsonl'), '{"type":"run"}\n')
    assert.equal(await agreementFingerprint(fixture), before, 'writing an evidence report cannot change the measured source')
    await fs.writeFile(palettesPath, '{"changed":true}\n')
    assert.notEqual(await agreementFingerprint(fixture), before, 'shared palette changes must invalidate a run')
    await fs.writeFile(palettesPath, '{}\n')
    await fs.writeFile(sourcePath, 'export const value = 2\n')
    assert.notEqual(await agreementFingerprint(fixture), before, 'uncommitted source changes must invalidate a run')
    git(['add', 'shaders/src/fixture.js'])
    git([...identity, 'commit', '-m', 'TEST: changed source fingerprint fixture'])
    assert.notEqual(await agreementFingerprint(fixture), before, 'a different clean revision must invalidate a run')
    console.log('PASS explicit case selection and source fingerprint changes')
} finally {
    await fs.rm(fixture, { recursive: true, force: true })
}
