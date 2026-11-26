#!/usr/bin/env node
/**
 * The version 2 Portable format and its one declaration grammar.
 *
 * - The generated schema is current, and it, the Portable normalizer and the
 *   runtime validator agree.
 * - Every catalog declaration is written in the version 2 form and read back
 *   unchanged. The test fails on a catalog ID it did not check.
 * - Legacy packages keep the legacy path.
 * - An unknown explicit version is refused before any registry changes.
 * - The core of the published 1.x reference release refuses a version 2
 *   package outright. It does not render the package without its passes.
 * - The documentation's version 2 examples are valid packages.
 *
 * The schema validator here implements the keywords the generated schema uses,
 * and refuses any other keyword, so the schema cannot rely on one that this
 * test does not check.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { CanvasRenderer, getEffect } from '../src/index.js'
import { normalizePortableDefinition, toPortablePackage, PACKAGE_KEYS } from '../src/portable/definition.js'
import { PORTABLE_FORMAT, PORTABLE_VERSION } from '../src/portable/grammar.js'
import { validateEffectDefinition } from '../src/runtime/effect-validator.js'
import { SCHEMA_PATH, renderPortableSchema } from '../scripts/generate-portable-schema.mjs'
import { exportReferenceSource } from '../../scripts/audit-portable-migration.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const baseline = readJson(path.join(REPO_ROOT, 'shaders/tests/fixtures/portable/catalog-baseline.json'))
const CONSUMERS = path.join(REPO_ROOT, 'shaders/tests/fixtures/portable/consumers')
const schema = readJson(SCHEMA_PATH)

// ---------------------------------------------------------------------------
// A JSON Schema validator for the keywords the generated schema uses.

const KEYWORDS = new Set([
    '$schema', '$id', 'title', 'description', '$defs', '$ref', 'type', 'enum', 'const', 'required',
    'properties', 'additionalProperties', 'propertyNames', 'pattern', 'minLength', 'minProperties',
    'items', 'anyOf', 'exclusiveMinimum', 'minimum', 'minItems', 'maxItems',
])

function typeOf(value) {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    if (Number.isInteger(value)) return 'integer'
    return typeof value
}

function matchesType(value, type) {
    const actual = typeOf(value)
    return type === actual || (type === 'number' && actual === 'integer')
}

function resolveRef(ref) {
    const match = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref)
    if (!match || !schema.$defs?.[match[1]]) throw new Error(`unsupported $ref ${ref}`)
    return schema.$defs[match[1]]
}

function validateSchema(value, node = schema, at = '') {
    for (const key of Object.keys(node)) {
        if (!KEYWORDS.has(key)) throw new Error(`the schema uses ${key}, which this test does not implement`)
    }
    const errors = []
    const fail = message => errors.push(`${at || '(root)'}: ${message}`)
    if (node.$ref) errors.push(...validateSchema(value, resolveRef(node.$ref), at))
    if (node.type && !matchesType(value, node.type)) {
        fail(`expected ${node.type}`)
        return errors
    }
    if ('const' in node && JSON.stringify(value) !== JSON.stringify(node.const)) fail(`expected ${JSON.stringify(node.const)}`)
    if (node.enum && !node.enum.some(option => JSON.stringify(option) === JSON.stringify(value))) fail('not one of the allowed values')
    if (typeof value === 'string') {
        if (node.pattern && !new RegExp(node.pattern).test(value)) fail(`does not match ${node.pattern}`)
        if (node.minLength !== undefined && value.length < node.minLength) fail('too short')
    }
    if (typeof value === 'number' && node.exclusiveMinimum !== undefined && !(value > node.exclusiveMinimum)) fail('too small')
    if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) fail('too small')
    if (node.anyOf && !node.anyOf.some(option => validateSchema(value, option, at).length === 0)) fail('matches no allowed form')
    if (typeOf(value) === 'array') {
        if (node.minItems !== undefined && value.length < node.minItems) fail('has too few items')
        if (node.maxItems !== undefined && value.length > node.maxItems) fail('has too many items')
        if (node.items) value.forEach((item, index) => errors.push(...validateSchema(item, node.items, `${at}[${index}]`)))
    }
    if (typeOf(value) === 'object') {
        for (const key of node.required || []) if (!(key in value)) fail(`${key} is required`)
        if (node.minProperties !== undefined && Object.keys(value).length < node.minProperties) fail('has too few fields')
        for (const [key, child] of Object.entries(value)) {
            const childAt = at ? `${at}.${key}` : key
            if (node.propertyNames) errors.push(...validateSchema(key, node.propertyNames, `${childAt} (name)`))
            if (node.properties && key in node.properties) {
                errors.push(...validateSchema(child, node.properties[key], childAt))
            } else if (node.additionalProperties === false) {
                errors.push(`${childAt}: not an allowed field`)
            } else if (node.additionalProperties && typeof node.additionalProperties === 'object') {
                errors.push(...validateSchema(child, node.additionalProperties, childAt))
            }
        }
    }
    return errors
}

// ---------------------------------------------------------------------------

const minimal = () => ({
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    name: 'Wave Two',
    func: 'waveTwo',
    namespace: 'user',
    globals: { speed: { type: 'float', default: 1, min: 0, max: 4, uniform: 'speed' } },
    passes: { main: { program: 'waveTwo', inputs: {}, outputs: { fragColor: 'outputTex' } } },
})
const SHADERS = {
    waveTwo: { glsl: '#version 300 es\nprecision highp float;\nuniform float speed;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(speed); }\n' },
}
const loaded = (pkg, func = pkg.func) => ({ ...pkg, shaders: { [pkg.passes?.main?.program ?? func]: SHADERS.waveTwo } })
const codes = result => result.diagnostics.map(entry => entry.code)
const paths = result => result.diagnostics.map(entry => entry.path)

function declarationOf(instance) {
    const declaration = {}
    for (const key of PACKAGE_KEYS) if (instance[key] !== undefined) declaration[key] = instance[key]
    return JSON.parse(JSON.stringify(declaration))
}

let referenceCore

before(() => {
    // The core of the published 1.x reference release, exported with git archive.
    referenceCore = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'portable-reference-core-')), 'checkout')
    exportReferenceSource(REPO_ROOT, baseline.reference.git_hash, referenceCore)
})

after(() => {
    if (referenceCore) fs.rmSync(path.dirname(referenceCore), { recursive: true, force: true })
})

test('the generated schema is current', () => {
    assert.equal(fs.readFileSync(SCHEMA_PATH, 'utf8').replace(/\r\n/g, '\n'), renderPortableSchema(),
        'run node shaders/scripts/generate-portable-schema.mjs')
    const check = execFileSync(process.execPath, [path.join(REPO_ROOT, 'shaders/scripts/generate-portable-schema.mjs'), '--check'], { encoding: 'utf8' })
    assert.match(check, /is current/)
})

test('every catalog declaration is written in the version 2 form, validates and reads back unchanged', async () => {
    const checked = []
    for (const id of baseline.effectIds) {
        const mod = await import(pathToFileURL(path.join(REPO_ROOT, 'shaders/effects', id, 'definition.js')).href)
        const instance = typeof mod.default === 'function' ? new mod.default() : mod.default
        const declaration = declarationOf(instance)
        const pkg = toPortablePackage(declaration)
        assert.deepEqual(validateSchema(pkg), [], `${id}: schema`)
        const result = normalizePortableDefinition(structuredClone(pkg))
        assert.deepEqual(result.diagnostics, [], `${id}: normalizer`)
        assert.equal(result.profile, 'v2')
        assert.deepEqual(validateEffectDefinition(result.definition), [], `${id}: runtime validator`)
        assert.deepEqual(result.definition, declaration, `${id}: the version 2 form reads back as the declaration`)
        assert.deepEqual(Object.keys(result.definition.globals || {}), Object.keys(declaration.globals || {}), `${id}: declaration order`)
        if (instance.paramAliases !== undefined) {
            // Aliases keep saved catalog programs working, and register through
            // the trusted catalog context. A Portable package refuses them.
            const aliased = normalizePortableDefinition({ ...structuredClone(pkg), paramAliases: instance.paramAliases })
            assert.deepEqual(paths(aliased), ['paramAliases'], `${id}: aliases`)
        }
        checked.push(id)
    }
    assert.deepEqual(checked, baseline.effectIds, 'every catalog ID is checked')
})

test('a palette parameter keeps its choices, in order and value', () => {
    const original = minimal()
    original.globals.palette = { type: 'palette', default: 2, choices: { warm: 0, cool: 1, 'bright:': null, mono: 2 }, uniform: 'palette' }
    const normalized = normalizePortableDefinition(structuredClone(original)).definition
    assert.deepEqual(normalized.globals.palette.choices, original.globals.palette.choices)
    assert.deepEqual(Object.keys(normalized.globals.palette.choices), Object.keys(original.globals.palette.choices))
})

test('a legacy package takes the legacy path, unchanged and with no diagnostics', () => {
    for (const dir of fs.readdirSync(CONSUMERS)) {
        const file = path.join(CONSUMERS, dir, 'definition.json')
        if (!fs.existsSync(file)) continue
        const oldPackage = readJson(file)
        const result = normalizePortableDefinition(oldPackage)
        assert.equal(result.diagnostics.length, 0, dir)
        assert.equal(result.profile, 'legacy', dir)
        assert.equal(result.definition, oldPackage, `${dir}: the same object`)
    }
    // A legacy package's own version field is its metadata, not the format's.
    assert.equal(normalizePortableDefinition({ name: 'old', version: '1.1', passes: [] }).profile, 'legacy')
})

test('an unknown explicit version or format is refused', () => {
    for (const version of [1, 3, '2', 2.5, undefined, null]) {
        const unknownVersion = { ...minimal(), version }
        if (version === undefined) delete unknownVersion.version
        const result = normalizePortableDefinition(unknownVersion)
        assert.ok(result.diagnostics.some(entry => entry.code === 'unsupported-version' && entry.path === 'version'), String(version))
        assert.equal(result.definition, null)
        assert.notDeepEqual(validateSchema(unknownVersion), [], `schema: ${version}`)
    }
    const otherFormat = normalizePortableDefinition({ ...minimal(), format: 'another-format' })
    assert.deepEqual(codes(otherFormat), ['unsupported-format'])
})

test('a package with paramAliases is refused at that path', () => {
    const aliasPackage = { ...minimal(), paramAliases: { rate: 'speed' } }
    const result = normalizePortableDefinition(aliasPackage)
    assert.ok(result.diagnostics.some(entry => entry.path === 'paramAliases'))
    assert.notDeepEqual(validateSchema(aliasPackage), [])
})

test('a package holds data only: functions, function source, lifecycle hooks and reserved keys are refused', () => {
    const withFunction = { ...minimal(), defaultProgram: () => 'x' }
    assert.ok(codes(normalizePortableDefinition(withFunction)).includes('function-value'))
    for (const source of ['function () { return 1 }', 'async function f() {}', '(a, b) => a + b', 'x => x']) {
        const pkg = minimal()
        pkg.globals.speed.ui = { label: source }
        assert.ok(codes(normalizePortableDefinition(pkg)).includes('function-string'), source)
    }
    const hook = normalizePortableDefinition({ ...minimal(), onInit: 'setup' })
    assert.deepEqual(paths(hook), ['onInit'])
    const reserved = normalizePortableDefinition(JSON.parse('{"format":"noisemaker-portable-effect","version":2,"func":"x","passes":{"main":{"program":"x","__proto__":{"polluted":true}}}}'))
    assert.ok(reserved.diagnostics.some(entry => entry.code === 'reserved-key' && entry.path === 'passes.main.__proto__'))
    assert.equal({}.polluted, undefined)
})

test('an unknown field is a diagnostic at its path', () => {
    const pkg = minimal()
    pkg.passes.main.blendMode = 'add'
    pkg.globals.speed.unit = 'hz'
    pkg.globals.speed.ui = { label: 'Speed', tooltip: 'x' }
    pkg.colour = 'red'
    const result = normalizePortableDefinition(pkg)
    assert.deepEqual(paths(result).sort(), ['colour', 'globals.speed.ui.tooltip', 'globals.speed.unit', 'passes.main.blendMode'])
    assert.ok(result.diagnostics.every(entry => entry.code === 'unknown-field'))
})

test('a diagnostic tells the author what to fix, and where', () => {
    // The version 2 shape without its marker would otherwise take the legacy path.
    const { format: _format, ...unmarked } = minimal()
    const missing = normalizePortableDefinition(unmarked)
    assert.deepEqual(codes(missing), ['missing-format'])
    assert.match(missing.diagnostics[0].message, /"format": "noisemaker-portable-effect"/)
    assert.equal(missing.definition, null)

    const arrayPasses = normalizePortableDefinition({ ...minimal(), passes: [{ name: 'main', program: 'waveTwo' }] })
    assert.match(arrayPasses.diagnostics[0].message, /the legacy form/)

    const misspelt = minimal()
    misspelt.globals.speed.unifrom = 'speed'
    delete misspelt.globals.speed.uniform
    assert.match(normalizePortableDefinition(misspelt).diagnostics[0].message, /did you mean uniform\?/)
    assert.match(normalizePortableDefinition({ ...minimal(), descripton: 'x' }).diagnostics[0].message, /did you mean description\?/)

    assert.match(normalizePortableDefinition({ ...minimal(), version: 1 }).diagnostics[0].message, /neither format nor version/)
    assert.match(normalizePortableDefinition({ ...minimal(), passes: { 'blur-h': { program: 'x' } } }).diagnostics[0].message,
        /letters, digits and underscores/)

    // A deeper rule names the pass by its key, not by its index.
    const sampler = minimal()
    sampler.passes.render = { program: 'waveTwo', inputs: { inputTex: 'inputTex' }, outputs: { fragColor: 'outputTex' }, samplerTypes: { inputTex: 'linear' } }
    const deep = normalizePortableDefinition(sampler).diagnostics.find(entry => entry.code === 'invalid-declaration')
    assert.equal(deep.path, 'passes.render')
    assert.match(deep.message, /^passes\.render: /)

    const badDefault = minimal()
    badDefault.globals.speed.default = 'fast'
    const global = normalizePortableDefinition(badDefault).diagnostics.find(entry => entry.code === 'invalid-declaration')
    assert.equal(global.path, 'globals.speed')
    assert.equal(normalizePortableDefinition({ ...minimal(), tags: ['sparkly'] }).diagnostics[0].path, 'tags')

    // A lifecycle hook is reported once.
    const hook = normalizePortableDefinition({ ...minimal(), onUpdate: 'function () {}' })
    assert.deepEqual(paths(hook), ['onUpdate'])
})

// Each example is valid in both the schema and the normalizer, or in neither.
const AGREEMENT = {
    minimal: minimal(),
    'a texture and a hidden control': (() => {
        const pkg = minimal()
        pkg.textures = { _history: { width: '100%', height: 'input', format: 'rgba16f' } }
        pkg.globals.speed.ui = { control: false }
        return pkg
    })(),
    'a starter flag and a name without func': (() => {
        const { func: _func, ...pkg } = minimal()
        return { ...pkg, name: 'waveTwo', starter: true }
    })(),
    'no version': (() => { const pkg = minimal(); delete pkg.version; return pkg })(),
    'version 3': { ...minimal(), version: 3 },
    'array passes': { ...minimal(), passes: [{ name: 'main', program: 'waveTwo' }] },
    'empty passes': { ...minimal(), passes: {} },
    'a pass name that is not an identifier': { ...minimal(), passes: { '1st': { program: 'waveTwo' } } },
    'a pass without a program': { ...minimal(), passes: { main: { inputs: {} } } },
    'an unknown pass field': { ...minimal(), passes: { main: { program: 'waveTwo', blendMode: 'add' } } },
    'an unknown parameter type': (() => { const pkg = minimal(); pkg.globals.speed.type = 'quaternion'; return pkg })(),
    'an unknown control': (() => { const pkg = minimal(); pkg.globals.speed.ui = { control: 'knob' }; return pkg })(),
    'an unknown texture format': { ...minimal(), textures: { _t: { format: 'rgb9e5' } } },
    'an unknown top-level field': { ...minimal(), colour: 'red' },
    paramAliases: { ...minimal(), paramAliases: { rate: 'speed' } },
    'a func that is not an identifier': { ...minimal(), func: '9wave' },
    'neither func nor name': (() => { const pkg = minimal(); delete pkg.func; delete pkg.name; return pkg })(),
    'a starter that is not a boolean': { ...minimal(), starter: 'yes' },
    'a capability declaration': { ...minimal(), capabilities: [{ id: 'example/pulse', version: 1, options: { rate: 2 }, bindings: { parameters: { rate: 'speed' } } }] },
    'capabilities that are not a list': { ...minimal(), capabilities: { id: 'example/pulse', version: 1 } },
    'a capability without a version': { ...minimal(), capabilities: [{ id: 'example/pulse' }] },
    'a capability ID without an owner': { ...minimal(), capabilities: [{ id: 'pulse', version: 1 }] },
    'a capability version of zero': { ...minimal(), capabilities: [{ id: 'example/pulse', version: 0 }] },
    'an unknown capability field': { ...minimal(), capabilities: [{ id: 'example/pulse', version: 1, provider: 'pulse.js' }] },
    'an unknown binding kind': { ...minimal(), capabilities: [{ id: 'example/pulse', version: 1, bindings: { meshes: {} } }] },
    'options that are not an object': { ...minimal(), capabilities: [{ id: 'example/pulse', version: 1, options: [2] }] },
    'an empty list of capabilities': { ...minimal(), capabilities: [] },
    'a texture binding': {
        ...minimal(),
        textures: { _overlay: { width: 'screen', height: 'screen', format: 'rgba8' } },
        capabilities: [{ id: 'example/pulse', version: 1, bindings: { textures: { target: '_overlay' } } }],
    },
    'a texture role bound to a number': { ...minimal(), capabilities: [{ id: 'example/pulse', version: 1, bindings: { textures: { target: 3 } } }] },
}

test('the schema and the normalizer agree', () => {
    for (const [label, example] of Object.entries(AGREEMENT)) {
        const machine = validateSchema(example).length === 0
        const runtime = normalizePortableDefinition(structuredClone(example)).diagnostics.length === 0
        assert.equal(machine, runtime, `${label}: schema ${machine ? 'accepts' : 'refuses'}, normalizer ${runtime ? 'accepts' : 'refuses'}`)
    }
    assert.ok(validateSchema(AGREEMENT.minimal).length === 0, 'the minimal package is valid')
})

test('the documentation\'s version 2 examples are valid packages', () => {
    const docs = path.join(REPO_ROOT, 'docs/shaders')
    let found = 0
    for (const file of fs.readdirSync(docs).filter(name => name.endsWith('.rst'))) {
        const text = fs.readFileSync(path.join(docs, file), 'utf8').replace(/\r\n/g, '\n')
        const blocks = text.split(/\n\.\. code-block:: json\n\n/).slice(1)
        for (const block of blocks) {
            const body = block.split('\n').filter((line, index, lines) =>
                lines.slice(0, index + 1).every(entry => entry === '' || entry.startsWith('   '))).join('\n')
            let example
            try { example = JSON.parse(body) } catch { continue }
            if (example?.format !== PORTABLE_FORMAT) continue
            found++
            assert.deepEqual(validateSchema(example), [], `${file}: schema`)
            assert.deepEqual(normalizePortableDefinition(example).diagnostics, [], `${file}: normalizer`)
        }
    }
    assert.ok(found > 0, 'the documentation holds a version 2 example')
})

test('the schema accepts the declaration of every positive package fixture', () => {
    // The fixtures of test_portable_package.mjs cover each pass property and
    // resource form. A positive one must also pass the schema, so the schema
    // and the runtime agree on what a package may declare.
    const forms = readJson(path.join(REPO_ROOT, 'shaders/tests/fixtures/portable/package-forms.json'))
    const positives = forms.fixtures.filter(fixture => fixture.kind === 'positive')
    assert.ok(positives.length > 0)
    for (const fixture of positives) {
        const pkg = { format: PORTABLE_FORMAT, version: PORTABLE_VERSION, name: 'fixture', func: 'fixture', ...fixture.definition }
        assert.deepEqual(validateSchema(pkg), [], fixture.id)
    }
})

test('this core registers a version 2 package, and refuses an unknown version without changing a registry', async () => {
    const renderer = new CanvasRenderer()
    const effect = await renderer.registerPortableEffect(loaded(minimal()))
    assert.equal(effect.instance.func, 'waveTwo')
    assert.deepEqual(effect.instance.passes.map(pass => pass.name), ['main'])
    assert.equal(getEffect('user.waveTwo'), effect.instance)

    const future = { ...loaded(minimal()), func: 'waveFuture', version: 3 }
    await assert.rejects(renderer.registerPortableEffect(future), /version 3 is not supported/)
    assert.equal(getEffect('user.waveFuture'), undefined)
    assert.equal(getEffect('waveFuture'), undefined)
})

test('the published 1.x reference core refuses a version 2 package outright', async () => {
    assert.equal(baseline.reference.version, '1.5.0')
    const core = await import(pathToFileURL(path.join(referenceCore, 'shaders/src/index.js')).href)
    const v2OnlyFeaturePackage = { ...loaded(minimal()), func: 'waveOld' }
    const olderCoreRejects = async pkg => {
        try {
            await new core.CanvasRenderer().registerPortableEffect(structuredClone(pkg))
            return false
        } catch (error) {
            return /passes must be a nonempty array/.test(error.message)
        }
    }
    assert.ok(await olderCoreRejects(v2OnlyFeaturePackage), 'a loud failure, not a degraded render')
    assert.equal(core.getEffect('user.waveOld'), undefined)
    // The same package in the legacy form registers on that core.
    const legacy = { ...v2OnlyFeaturePackage, passes: [{ name: 'main', ...v2OnlyFeaturePackage.passes.main }] }
    delete legacy.format
    delete legacy.version
    const effect = await new core.CanvasRenderer().registerPortableEffect(legacy)
    assert.equal(effect.instance.func, 'waveOld')
})
