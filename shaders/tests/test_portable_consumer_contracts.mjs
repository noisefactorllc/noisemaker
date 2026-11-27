#!/usr/bin/env node
/**
 * The contracts of the Portable format's consumers outside Noisemaker, as
 * fixtures (shaders/tests/fixtures/portable/consumers/).
 *
 * - Each product's v1 package, in the exact shape its create path emits,
 *   handed to the engine the way that product hands it.
 * - A user-uploaded definition.js, in the form Noisedeck wraps it.
 * - Node import() of every definition.js and of the effect validator from a
 *   plain checkout, as the port generators load them.
 * - The Layers source override, and Shade's projection of each effect.
 *
 * The migration must keep each of these as it is recorded here.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import { CanvasRenderer, Effect, compile, getEffect, registerEffect, registerOp, registerStarterOps } from '../src/index.js'
import {
    BASELINE_RELATIVE,
    LAYERS_SOURCE_RELATIVE,
    REPO_ROOT,
    SHADE_PROJECTION_RELATIVE,
    exportReferenceSource,
    firstDifference,
    loadLayersSource,
    loadShadeProjections,
    readPackageDir,
} from '../../scripts/audit-portable-migration.mjs'

const CONSUMERS = path.join(REPO_ROOT, 'shaders/tests/fixtures/portable/consumers')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const baseline = readJson(path.join(REPO_ROOT, BASELINE_RELATIVE))

let plain

before(() => {
    // A plain checkout: the tree at HEAD, with no dependencies and no build step.
    const head = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    plain = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'portable-plain-')), 'checkout')
    exportReferenceSource(REPO_ROOT, head, plain)
})

after(() => {
    if (plain) fs.rmSync(path.dirname(plain), { recursive: true, force: true })
})

function assertCarries(instance, definition, keys) {
    for (const key of keys) assert.deepEqual(instance[key], definition[key], key)
}

test('Noisedeck\'s package registers through registerPortableEffect, on its bare renderer', async () => {
    const definition = readPackageDir(path.join(CONSUMERS, 'noisedeck-v1'))
    assert.deepEqual(Object.keys(readJson(path.join(CONSUMERS, 'noisedeck-v1/definition.json'))),
        ['func', 'name', 'namespace', 'description', 'tags', 'globals', 'passes'])
    assert.deepEqual(Object.keys(definition.shaders.noisedeckWave), ['glsl'], 'its share path carries GLSL only')
    const receiver = Object.create(CanvasRenderer.prototype)
    receiver._loadedEffects = new Map()
    const effect = await receiver.registerPortableEffect({ ...definition, func: definition.func ?? definition.name, namespace: 'user' })
    assert.ok(effect.instance instanceof Effect)
    assert.equal(getEffect('user.noisedeckWave'), effect.instance)
    assert.equal(getEffect('user/noisedeckWave'), effect.instance)
    assertCarries(effect.instance, definition, ['name', 'description', 'tags', 'globals', 'passes', 'shaders'])
    assert.equal(effect.instance.starter, true, 'starter is inferred from pass inputs')
})

test('Polymorphic\'s package registers through registerPortableEffect, with its starter flag', async () => {
    const definition = readPackageDir(path.join(CONSUMERS, 'polymorphic-v1'))
    assert.deepEqual(Object.keys(readJson(path.join(CONSUMERS, 'polymorphic-v1/definition.json'))),
        ['name', 'func', 'namespace', 'description', 'tags', 'globals', 'passes', 'starter'])
    const renderer = new CanvasRenderer()
    const effect = await CanvasRenderer.prototype.registerPortableEffect.call(renderer, definition)
    assert.equal(getEffect('user.polymorphicWave'), effect.instance)
    assertCarries(effect.instance, definition, ['name', 'description', 'tags', 'globals', 'passes', 'shaders'])
    assert.equal(effect.instance.starter, true)
    assert.deepEqual(Object.keys(effect.instance.shaders.polymorphicWave), ['glsl', 'wgsl'])
})

test('Foundry\'s package: other products register it, ignoring its extra keys; Foundry registers it with new Effect', async () => {
    const definition = readPackageDir(path.join(CONSUMERS, 'foundry-v1'))
    assert.deepEqual(Object.keys(readJson(path.join(CONSUMERS, 'foundry-v1/definition.json'))),
        ['name', 'func', 'namespace', 'originalNamespace', 'description', 'tags', 'globals', 'passes', 'textures', 'starter', 'hasTex', 'outputTex3d', 'outputGeo'])
    // An importing product hands it to registerPortableEffect.
    const renderer = new CanvasRenderer()
    const effect = await renderer.registerPortableEffect(definition)
    assertCarries(effect.instance, definition, ['name', 'description', 'tags', 'globals', 'passes', 'textures'])
    for (const ignored of ['originalNamespace', 'hasTex', 'outputTex3d', 'outputGeo']) {
        assert.equal(ignored in effect.instance, false, `${ignored} does not reach the instance`)
    }
    assert.equal(effect.instance.starter, true)
    // Foundry's own path builds the Effect and registers it with the runtime.
    const own = new Effect({ ...definition, func: 'foundryWaveOwn', namespace: 'user' })
    own.shaders = definition.shaders
    renderer.registerEffectWithRuntime({ namespace: 'user', name: 'foundryWaveOwn', instance: own })
    assert.equal(getEffect('user.foundryWaveOwn'), own)
    assert.equal(own.outputTex3d, undefined, 'a null outputTex3d stays unset')
})

// Shade builds the single pass its package leaves out, and its tags.
function shadeInstance(definition, func) {
    const instance = new Effect({
        name: func, namespace: 'user', func, description: definition.description,
        tags: ['custom', 'user'], globals: definition.globals,
        passes: [{ name: 'render', program: definition.name, inputs: {}, outputs: { fragColor: 'outputTex' } }],
    })
    instance.shaders = { [definition.name]: { glsl: definition.shaders[definition.name].glsl } }
    return instance
}

test('Shade\'s single-pass package has no passes: registerPortableEffect rejects it', async () => {
    const definition = readPackageDir(path.join(CONSUMERS, 'shade-v1'))
    assert.deepEqual(Object.keys(readJson(path.join(CONSUMERS, 'shade-v1/definition.json'))),
        ['name', 'namespace', 'func', 'description', 'globals'])
    assert.deepEqual(Object.keys(definition.shaders), ['shadeWave'])
    assert.deepEqual(Object.keys(definition.shaders.shadeWave), ['glsl'], 'its package carries GLSL only')
    await assert.rejects(new CanvasRenderer().registerPortableEffect(structuredClone(definition)), /passes must be a nonempty array/)
    assert.equal(getEffect('user/shadeWave'), undefined)
})

test('Shade registers its package through registerEffectsFromBundle, as its sign-in page does', () => {
    const definition = readPackageDir(path.join(CONSUMERS, 'shade-v1'))
    const renderer = new CanvasRenderer()
    const instance = shadeInstance(definition, 'shadeWave')
    assert.equal(renderer.registerEffectsFromBundle({ namespace: 'user', effects: { shadeWave: instance } }), 1)
    assert.equal(getEffect('user/shadeWave'), instance)
    assert.equal(getEffect('user.shadeWave'), instance)
    assert.equal(renderer._loadedEffects.get('user/shadeWave')?.instance, instance)
    assert.deepEqual(instance.passes.map(pass => pass.program), ['shadeWave'])
    // A second registration of the same ID is not counted again.
    assert.equal(renderer.registerEffectsFromBundle({ namespace: 'user', effects: { shadeWave: instance } }), 0)
})

test('Shade\'s editor registers the effect, its op and its starter op, and its program compiles', () => {
    const definition = readPackageDir(path.join(CONSUMERS, 'shade-v1'))
    const instance = shadeInstance(definition, 'shadeWaveEditor')
    registerEffect('user.shadeWaveEditor', instance)
    registerEffect('user/shadeWaveEditor', instance)
    registerOp('user.shadeWaveEditor', {
        name: 'shadeWaveEditor',
        args: Object.entries(definition.globals).map(([name, spec]) => ({ name, type: spec.type, default: spec.default, min: spec.min, max: spec.max, uniform: spec.uniform })),
    })
    registerStarterOps(['user.shadeWaveEditor'])
    assert.equal(getEffect('user.shadeWaveEditor'), instance)
    assert.equal(getEffect('user/shadeWaveEditor'), instance)
    const compiled = compile('search user\nshadeWaveEditor().write(o0)\nrender(o0)')
    assert.deepEqual(compiled.diagnostics, [])
    assert.equal(compiled.plans[0].chain[0].op, 'user.shadeWaveEditor')
})

async function importWrapped(source, label) {
    // Noisedeck removes the import of Effect, defines Effect from the engine
    // bundle's global, and loads the result as a module.
    const body = source.replace(/^\s*import\s*\{[^}]*\}\s*from\s*['"][^'"]*effect\.js['"]\s*;?\s*$/gm, '')
    const text = `const Effect = globalThis.NoisemakerShadersCore?.Effect\n${body}\n//# sourceURL=${label}`
    return import(`data:text/javascript,${encodeURIComponent(text)}`)
}

test('a user definition.js loads in the form Noisedeck wraps: a default class, constructed with no arguments', async () => {
    globalThis.NoisemakerShadersCore = { Effect }
    try {
        const dir = path.join(CONSUMERS, 'user-definition-js')
        const mod = await importWrapped(fs.readFileSync(path.join(dir, 'definition.js'), 'utf8'), 'user-definition-js')
        assert.equal(typeof mod.default, 'function', 'the default export is a class')
        const instance = new mod.default()
        assert.ok(instance instanceof Effect)
        assert.equal(instance.func, 'userDefinitionWave')
        assert.equal(instance.namespace, 'user')
        assert.deepEqual(instance.passes.map(pass => pass.program), ['userDefinitionWave'])
        assert.deepEqual(Object.keys(instance.globals), ['speed'])
        // The built-in instance form does not load on this path.
        const builtIn = await importWrapped("export default new Effect({ name: 'Instance', func: 'instanceForm', passes: [] })", 'instance-form')
        assert.throws(() => new builtIn.default(), TypeError)
    } finally {
        delete globalThis.NoisemakerShadersCore
    }
})

test('every definition.js imports from a plain checkout with its recorded export kind, and the validator keeps its one export', async () => {
    assert.equal(fs.existsSync(path.join(plain, 'node_modules')), false, 'the checkout has no dependencies')
    const kinds = []
    for (const [id] of baseline.exportKinds) {
        const mod = await import(pathToFileURL(path.join(plain, 'shaders/effects', id, 'definition.js')).href)
        kinds.push([id, typeof mod.default === 'function' ? 'class' : 'instance'])
    }
    assert.deepEqual(kinds, baseline.exportKinds)
    const validator = await import(pathToFileURL(path.join(plain, 'shaders/src/runtime/effect-validator.js')).href)
    assert.deepEqual(Object.keys(validator), ['validateEffectDefinition'])
    assert.equal(typeof validator.validateEffectDefinition, 'function')
})

test('the Layers source override reads the same files for every effect', async () => {
    const recorded = readJson(path.join(REPO_ROOT, LAYERS_SOURCE_RELATIVE))
    assert.deepEqual(Object.keys(recorded), baseline.effectIds)
    const actual = await loadLayersSource(plain, baseline.effectIds)
    for (const id of baseline.effectIds) assert.deepEqual(actual[id], recorded[id], id)
})

// Shade writes the fields of effect, parameter and pass records in its own
// order. The order of the authored collections inside them still matters.
function orderShadeDescriptors({ globals, passes, ...fields }) {
    const sortFields = record => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
    return sortFields({
        ...fields,
        globals: Object.fromEntries(Object.entries(globals).map(([name, spec]) => [name, sortFields(spec)])),
        passes: passes.map(sortFields),
    })
}

test('Shade keeps the recorded legacy projection and reads the full native declarations', async () => {
    const recorded = readJson(path.join(REPO_ROOT, SHADE_PROJECTION_RELATIVE))
    assert.deepEqual(Object.keys(recorded), baseline.effectIds)
    const actual = await loadShadeProjections(REPO_ROOT, baseline.effectIds)
    for (const id of baseline.effectIds) {
        const native = fs.existsSync(path.join(REPO_ROOT, 'shaders/effects', id, 'definition.json'))
        if (!native) {
            assert.equal(firstDifference(actual[id], recorded[id]), null, id)
            continue
        }

        // Catalog-only aliases are resolved by the engine. Shade exposes the
        // declaration with parameter names and its reader's default bindings.
        const { globals = {}, passes, paramAliases: _aliases, ...fields } = baseline.metadata[id].definition
        const expectedGlobals = Object.fromEntries(Object.entries(globals).map(([name, spec]) =>
            [name, { ...spec, name, type: spec.type || 'float', uniform: spec.uniform || name }]))
        const expected = {
            ...fields,
            globals: expectedGlobals,
            passes: passes.map(pass => ({ ...pass, program: pass.program || 'main' })),
            format: 'json',
        }
        assert.equal(firstDifference(orderShadeDescriptors(actual[id]), orderShadeDescriptors(expected)),
            null, `${id}: full declaration and collection order from the catalog baseline`)

        // The source format and partial-JS parser notices describe the reader.
        const { format: _format, partial: _partial, partialReasons: _reasons, ...legacyValues } = recorded[id]
        assert.partialDeepStrictEqual(actual[id], legacyValues, `${id}: values exposed by the legacy reader`)
        const legacyNames = Object.keys(legacyValues.globals)
        const carriedNames = Object.keys(actual[id].globals).filter(name => Object.hasOwn(legacyValues.globals, name))
        assert.deepEqual(carriedNames, legacyNames, `${id}: parameter order exposed by the legacy reader`)
    }
})
