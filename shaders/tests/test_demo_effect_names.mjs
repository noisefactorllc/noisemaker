#!/usr/bin/env node
/*
 * extractEffectNamesFromDsl() must name every effect that compileGraph()
 * resolves, so a host can load exactly those effects before it compiles.
 *
 * The helper used to split lines and match regular expressions. An inline
 * `//` comment after `search`, a `search` directive across two lines, or a
 * block comment before `search` lost effects, and the export kits then failed
 * to start. The helper now reads the DSL with the language lexer.
 *
 * The reference is compileGraph() with all manifest effects registered.
 *
 * Usage: node shaders/tests/test_demo_effect_names.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { CanvasRenderer } from '../src/renderer/canvas.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { extractEffectNamesFromDsl } from '../../demo/shaders/lib/demo-ui.js'

const shadersDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// File-backed fetch so the real CanvasRenderer loads every manifest effect.
globalThis.fetch = async (url) => {
    const filePath = fileURLToPath(url)
    if (!fs.existsSync(filePath)) return { ok: false, status: 404 }
    const text = fs.readFileSync(filePath, 'utf8')
    return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) }
}

const renderer = new CanvasRenderer({ basePath: pathToFileURL(shadersDir).href })
const manifest = await renderer.loadManifest()
const manifestIds = Object.keys(manifest)
const loadFailures = []
for (const effectId of manifestIds) {
    try {
        await renderer.loadEffect(effectId)
    } catch (err) {
        loadFailures.push(`${effectId}: ${err.message}`)
    }
}
assert.deepEqual(loadFailures, [], 'every manifest effect loads')
// DSL calls name an effect by func; the manifest names it by directory.
assert.deepEqual(
    manifestIds.filter((effectId) => renderer.loadedEffects.get(effectId).instance.func !== effectId.split('/')[1]),
    [],
    'each manifest effect func equals its directory name')

/** Effect IDs that compileGraph() resolves for a program. */
function compiledEffectIds(dsl) {
    const graph = compileGraph(dsl)
    const ids = new Set()
    for (const pass of graph.passes) {
        // effectKey is the resolved op, `namespace.func`; func is the effect's
        // directory name in the manifest.
        if (!pass.effectKey) continue
        const effectId = pass.effectKey.replace('.', '/')
        if (manifest[effectId]) ids.add(effectId)
    }
    return [...ids].sort()
}

function helperEffectIds(dsl) {
    return extractEffectNamesFromDsl(dsl, manifest).map((entry) => entry.effectId).sort()
}

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const VOLUME_CHAIN = 'noise3d().render3d().write(o0)\nrender(o0)'
const PROGRAMS = {
    baseline: `search synth3d, render\n${VOLUME_CHAIN}`,
    inlineComment: `search synth3d, render // volume chain\n${VOLUME_CHAIN}`,
    multiLineSearch: `search synth3d,\n    render\n${VOLUME_CHAIN}`,
    blockCommentFirst: `/* volume chain */ search synth3d, render\n${VOLUME_CHAIN}`
}

for (const [label, dsl] of Object.entries(PROGRAMS)) {
    test(`${label}: the helper returns the effects that compileGraph() resolves`, () => {
        const expected = compiledEffectIds(dsl)
        assert.deepEqual(expected, ['render/render3d', 'synth3d/noise3d'])
        assert.deepEqual(helperEffectIds(dsl), expected)
    })
}

test('each entry carries the namespace and name of its effect ID', () => {
    assert.deepEqual(extractEffectNamesFromDsl(PROGRAMS.inlineComment, manifest), [
        { effectId: 'synth3d/noise3d', namespace: 'synth3d', name: 'noise3d' },
        { effectId: 'render/render3d', namespace: 'render', name: 'render3d' }
    ])
})

test('the first search namespace that defines a name wins, as in the validator', () => {
    const dsl = 'search classicNoisedeck, synth\nnoise().write(o0)\nrender(o0)'
    assert.deepEqual(compiledEffectIds(dsl), ['classicNoisedeck/noise'])
    assert.deepEqual(helperEffectIds(dsl), ['classicNoisedeck/noise'])
})

test('from(namespace, call()) resolves the call in that namespace only', () => {
    const dsl = 'search synth, filter\nfrom(classicNoisedeck, noise()).bloom().write(o0)\nrender(o0)'
    assert.deepEqual(compiledEffectIds(dsl), ['classicNoisedeck/noise', 'filter/bloom'])
    assert.deepEqual(helperEffectIds(dsl), ['classicNoisedeck/noise', 'filter/bloom'])
})

test('a call through a let name resolves to the bound effect', () => {
    const dsl = 'search synth, filter\nlet base = noise\nbase().bloom().write(o0)\nrender(o0)'
    assert.deepEqual(compiledEffectIds(dsl), ['filter/bloom', 'synth/noise'])
    assert.deepEqual(helperEffectIds(dsl), ['filter/bloom', 'synth/noise'])
})

test('commented-out calls are not effects', () => {
    const dsl = 'search synth, filter\n// bloom()\nnoise() /* .warp() */\n  .write(o0)\nrender(o0)'
    assert.deepEqual(compiledEffectIds(dsl), ['synth/noise'])
    assert.deepEqual(helperEffectIds(dsl), ['synth/noise'])
})

test('a chain fragment with a search prefix names its effects', () => {
    // Hosts load the effects of a template fragment before they insert it
    // into a program. The fragment itself is not a complete program.
    const fragment = 'search render, filter\n.loopBegin()\n  .warp()\n  .loopEnd()'
    assert.deepEqual(helperEffectIds(fragment), ['filter/warp', 'render/loopBegin', 'render/loopEnd'])
})

test('source that does not lex names no effects', () => {
    assert.deepEqual(helperEffectIds('search synth\nnoise(text: "unterminated).write(o0)'), [])
    assert.deepEqual(helperEffectIds(''), [])
    assert.deepEqual(helperEffectIds(null), [])
})

test('every effect defaultProgram: the helper returns the effects that compileGraph() resolves', async () => {
    let compared = 0
    const mismatches = []
    for (const effectId of manifestIds) {
        const dsl = renderer.loadedEffects.get(effectId).instance.defaultProgram
        if (!dsl) continue
        const expected = compiledEffectIds(dsl)
        const actual = helperEffectIds(dsl)
        compared++
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            mismatches.push(`${effectId}: helper ${JSON.stringify(actual)} compileGraph ${JSON.stringify(expected)}`)
        }
    }
    assert.deepEqual(mismatches, [])
    assert.ok(compared > 0, 'no defaultProgram was compared')
    console.log(`  compared ${compared} defaultPrograms`)
})

for (const { name, fn } of tests) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
    } catch (error) {
        console.error(`FAIL: ${name}`)
        console.error(error)
        process.exit(1)
    }
}

console.log(`\n${tests.length}/${tests.length} extractEffectNamesFromDsl tests passed (${manifestIds.length} manifest effects registered)`)
