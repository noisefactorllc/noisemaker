#!/usr/bin/env node
// Capability declarations in a version 2 Portable package, and their check
// against data-only capability descriptors.
//
// A package declares the capabilities it needs in `capabilities`: each entry
// names a capability ID and its integer contract version, gives options, and
// binds the capability's parameter and texture roles to the package's own
// globals and textures. A descriptor states, as data, which options and
// bindings a capability accepts, which bound parameters and resources trigger
// regeneration, the upload orientation and the methods the capability adds.
// The check runs no provider code: a descriptor is data, and a host resolves an
// executable provider only when it registers the effect.
//
// Run: node --test shaders/tests/test_portable_capability_declarations.mjs
import assert from 'node:assert/strict'
import test from 'node:test'

import { CanvasRenderer, getEffect } from '../src/index.js'
import { normalizePortableDefinition } from '../src/portable/definition.js'
import { checkCapabilityDeclarations, normalizeCapabilityDescriptor } from '../src/portable/descriptor.js'
import { loadPortablePackage } from '../src/portable/package.js'
import { PORTABLE_FORMAT, PORTABLE_VERSION } from '../src/portable/grammar.js'
import { validateEffectDefinition } from '../src/runtime/effect-validator.js'

const FRAGMENT = '#version 300 es\nprecision highp float;\nuniform sampler2D inputTex;\nuniform sampler2D overlayTex;\nout vec4 fragColor;\nvoid main() { fragColor = texelFetch(overlayTex, ivec2(gl_FragCoord.xy), 0); }\n'

const pkg = (overrides = {}) => ({
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    name: 'Overlay Probe',
    func: 'overlayProbe',
    namespace: 'user',
    globals: {
        seed: { type: 'int', default: 1, min: 1, max: 100, uniform: 'seed' },
        tint: { type: 'vec3', default: [1, 0.5, 0.25], uniform: 'tint' },
        alpha: { type: 'float', default: 0.5, min: 0, max: 1, uniform: 'alpha' },
    },
    textures: { overlayTex: { width: 'screen', height: 'screen', format: 'rgba8' } },
    passes: {
        blend: { program: 'blend', inputs: { inputTex: 'inputTex', overlayTex: 'overlayTex' }, outputs: { fragColor: 'outputTex' } },
    },
    capabilities: [
        {
            id: 'example/stripes',
            version: 1,
            options: { count: 4, style: 'soft' },
            bindings: { parameters: { seed: 'seed', tint: 'tint', alpha: 'alpha' }, textures: { target: 'overlayTex' } },
        },
    ],
    ...overrides,
})

const descriptor = (overrides = {}) => ({
    id: 'example/stripes',
    version: 1,
    description: 'Draws stripes into a texture on the CPU',
    options: {
        count: { type: 'integer', minimum: 1, maximum: 16, required: true },
        style: { type: 'string', enum: ['soft', 'hard'] },
        layers: { type: 'array', items: { type: 'object', properties: { width: { type: 'number', minimum: 0 } } } },
    },
    bindings: {
        parameters: {
            seed: { types: ['int', 'float'], required: true },
            tint: { types: ['vec3', 'color'] },
            alpha: { types: ['float'] },
        },
        textures: { target: { required: true } },
    },
    dependencies: { parameters: ['seed', 'tint', 'alpha'], resources: [] },
    uploadOrientation: 'flipY',
    methods: ['setStripeCount'],
    ...overrides,
})

const codes = result => result.diagnostics.map(entry => entry.code)
// One diagnostic with both the code and the path.
function has(result, code, path) {
    assert.ok(result.diagnostics.some(entry => entry.code === code && entry.path === path),
        `expected ${code} at ${path}, got ${JSON.stringify(result.diagnostics.map(entry => [entry.code, entry.path]))}`)
}
const encoder = new TextEncoder()
const files = map => new Map(Object.entries(map).map(([name, value]) => [name, encoder.encode(typeof value === 'string' ? value : JSON.stringify(value))]))

test('a package declares capabilities: they read back in their declaration order', () => {
    const declared = pkg()
    declared.capabilities.push({ id: 'example/second', version: 3, bindings: { textures: { target: 'overlayTex' } } })
    const result = normalizePortableDefinition(declared)
    assert.deepEqual(result.diagnostics, [])
    assert.deepEqual(result.definition.capabilities.map(entry => entry.id), ['example/stripes', 'example/second'])
})

test('a malformed capability declaration is refused at its path', () => {
    const cases = [
        [{ capabilities: { id: 'example/stripes', version: 1 } }, 'invalid-value', 'capabilities'],
        [{ capabilities: ['example/stripes'] }, 'invalid-value', 'capabilities.0'],
        [{ capabilities: [{ version: 1 }] }, 'missing-field', 'capabilities.0.id'],
        [{ capabilities: [{ id: 'stripes', version: 1 }] }, 'invalid-value', 'capabilities.0.id'],
        [{ capabilities: [{ id: 'Example/Stripes', version: 1 }] }, 'invalid-value', 'capabilities.0.id'],
        [{ capabilities: [{ id: 'example/stripes' }] }, 'missing-field', 'capabilities.0.version'],
        [{ capabilities: [{ id: 'example/stripes', version: 0 }] }, 'invalid-value', 'capabilities.0.version'],
        [{ capabilities: [{ id: 'example/stripes', version: 1.5 }] }, 'invalid-value', 'capabilities.0.version'],
        [{ capabilities: [{ id: 'example/stripes', version: '1' }] }, 'invalid-value', 'capabilities.0.version'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, provider: 'stripes.js' }] }, 'unknown-field', 'capabilities.0.provider'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, options: [4] }] }, 'invalid-value', 'capabilities.0.options'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, bindings: { uniforms: {} } }] }, 'unknown-field', 'capabilities.0.bindings.uniforms'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, bindings: { parameters: { seed: 7 } } }] }, 'invalid-value', 'capabilities.0.bindings.parameters.seed'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, bindings: { parameters: { seed: 'speed' } } }] }, 'unknown-binding', 'capabilities.0.bindings.parameters.seed'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, bindings: { textures: { target: 'missingTex' } } }] }, 'unknown-binding', 'capabilities.0.bindings.textures.target'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, bindings: { parameters: { '1st': 'seed' } } }] }, 'invalid-name', 'capabilities.0.bindings.parameters.1st'],
        [{ capabilities: [{ id: 'example/stripes', version: 1 }, { id: 'example/stripes', version: 2 }] }, 'duplicate-capability', 'capabilities.1.id'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, options: { draw: 'function () { return 1 }' } }] }, 'function-string', 'capabilities.0.options.draw'],
        [{ capabilities: [{ id: 'example/stripes', version: 1, options: JSON.parse('{"__proto__": {"x": 1}}') }] }, 'reserved-key', 'capabilities.0.options.__proto__'],
    ]
    for (const [overrides, code, path] of cases) {
        const result = normalizePortableDefinition(pkg(overrides))
        assert.equal(result.definition, null, `${path} ${code}: refused`)
        has(result, code, path)
    }
})

test('a descriptor is data: it normalizes, and a malformed one is refused at its path', () => {
    assert.deepEqual(normalizeCapabilityDescriptor(descriptor()).diagnostics, [])
    let called = 0
    const cases = [
        [descriptor({ create: () => { called++ } }), 'function-value', 'create'],
        [descriptor({ id: 'stripes' }), 'invalid-value', 'id'],
        [descriptor({ version: 0 }), 'invalid-value', 'version'],
        [descriptor({ provider: 'x' }), 'unknown-field', 'provider'],
        [descriptor({ options: { count: { type: 'float' } } }), 'invalid-value', 'options.count.type'],
        [descriptor({ options: { count: { type: 'integer', minimum: 'one' } } }), 'invalid-value', 'options.count.minimum'],
        [descriptor({ options: { count: { type: 'integer', pattern: '^a' } } }), 'unknown-field', 'options.count.pattern'],
        [descriptor({ options: { layers: { type: 'array', items: { type: 'object', properties: { w: { type: 'mystery' } } } } } }), 'invalid-value', 'options.layers.items.properties.w.type'],
        [descriptor({ bindings: { parameters: { seed: { types: ['quaternion'] } } } }), 'invalid-value', 'bindings.parameters.seed.types'],
        [descriptor({ bindings: { meshes: {} } }), 'unknown-field', 'bindings.meshes'],
        [descriptor({ dependencies: { parameters: ['speed'], resources: [] } }), 'unknown-binding', 'dependencies.parameters.0'],
        [descriptor({ dependencies: { parameters: [], resources: ['canvas'] } }), 'unknown-binding', 'dependencies.resources.0'],
        [descriptor({ uploadOrientation: 'sideways' }), 'invalid-value', 'uploadOrientation'],
        [descriptor({ methods: ['set stripes'] }), 'invalid-name', 'methods.0'],
        [descriptor({ methods: ['onInit'] }), 'invalid-name', 'methods.0'],
    ]
    for (const [raw, code, path] of cases) {
        const result = normalizeCapabilityDescriptor(raw)
        assert.equal(result.descriptor, null, `${path} ${code}: refused`)
        has(result, code, path)
    }
    assert.equal(called, 0, 'normalizing a descriptor calls nothing in it')
})

test('declarations are checked against descriptors, running no provider code', () => {
    const definition = normalizePortableDefinition(pkg()).definition
    const checked = checkCapabilityDeclarations(definition, [descriptor()])
    assert.deepEqual(checked.diagnostics, [])
    assert.equal(checked.complete, true)
    assert.deepEqual(checked.unresolved, [])

    const check = overrides => checkCapabilityDeclarations(normalizePortableDefinition(pkg({ capabilities: [overrides] })).definition, [descriptor()])
    const base = { id: 'example/stripes', version: 1, bindings: { parameters: { seed: 'seed' }, textures: { target: 'overlayTex' } } }
    const cases = [
        [{ ...base, options: {} }, 'missing-option', 'capabilities.0.options.count'],
        [{ ...base, options: { count: 2.5 } }, 'invalid-option', 'capabilities.0.options.count'],
        [{ ...base, options: { count: 40 } }, 'invalid-option', 'capabilities.0.options.count'],
        [{ ...base, options: { count: 2, style: 'wavy' } }, 'invalid-option', 'capabilities.0.options.style'],
        [{ ...base, options: { count: 2, speed: 3 } }, 'unknown-option', 'capabilities.0.options.speed'],
        [{ ...base, options: { count: 2, layers: [{ width: -1 }] } }, 'invalid-option', 'capabilities.0.options.layers.0.width'],
        [{ ...base, options: { count: 2, layers: [{ height: 1 }] } }, 'unknown-option', 'capabilities.0.options.layers.0.height'],
        [{ ...base, options: { count: 2 }, bindings: { textures: { target: 'overlayTex' } } }, 'missing-binding', 'capabilities.0.bindings.parameters.seed'],
        [{ ...base, options: { count: 2 }, bindings: { ...base.bindings, parameters: { seed: 'seed', speed: 'alpha' } } }, 'unknown-binding', 'capabilities.0.bindings.parameters.speed'],
        [{ ...base, options: { count: 2 }, bindings: { ...base.bindings, parameters: { seed: 'tint' } } }, 'invalid-binding', 'capabilities.0.bindings.parameters.seed'],
        [{ ...base, version: 2, options: { count: 2 } }, 'unsupported-capability-version', 'capabilities.0.version'],
    ]
    for (const [declaration, code, path] of cases) {
        const result = check(declaration)
        has(result, code, path)
    }
})

test('without its descriptor, a declaration passes the structural check only, and the result says it is incomplete', () => {
    const definition = normalizePortableDefinition(pkg()).definition
    const checked = checkCapabilityDeclarations(definition, [])
    assert.deepEqual(checked.diagnostics, [])
    assert.equal(checked.complete, false)
    assert.deepEqual(checked.unresolved, [{ id: 'example/stripes', version: 1 }])
    const malformed = checkCapabilityDeclarations(definition, [{ id: 'example/stripes', version: 1, create() {} }])
    assert.ok(codes(malformed).includes('function-value'), 'a malformed descriptor input is a diagnostic, not a descriptor')
})

test('registration refuses a package that declares a capability no provider serves, and changes no registry', async () => {
    const renderer = new CanvasRenderer()
    const declared = { ...pkg(), shaders: { blend: { glsl: FRAGMENT } } }
    await assert.rejects(() => renderer.registerPortableEffect(declared), error => {
        assert.match(error.message, /^Portable effect: no provider is registered for capability example\/stripes version 1/)
        assert.deepEqual(error.diagnostics.map(entry => entry.code), ['missing-provider'])
        return true
    })
    assert.equal(getEffect('user.overlayProbe'), undefined)
    assert.equal(renderer.loadedEffects.size, 0)
    const { capabilities: _capabilities, ...plain } = declared
    await renderer.registerPortableEffect(plain)
    assert.ok(getEffect('user.overlayProbe'), 'the same package without its capability registers')
})

test('a package loads its descriptors from package files or from the caller, and says whether its check is complete', () => {
    const base = { 'definition.json': pkg(), 'glsl/blend.glsl': FRAGMENT }
    const alone = loadPortablePackage(files(base))
    assert.deepEqual(alone.diagnostics, [])
    assert.deepEqual(alone.capabilities, { complete: false, unresolved: [{ id: 'example/stripes', version: 1 }] })

    const withFile = loadPortablePackage(files({ ...base, 'capabilities/example/stripes/v1.json': descriptor() }))
    assert.deepEqual(withFile.diagnostics, [])
    assert.deepEqual(withFile.capabilities, { complete: true, unresolved: [] })
    assert.equal(withFile.assets.has('capabilities/example/stripes/v1.json'), false, 'a descriptor file is not an asset')

    const explicit = loadPortablePackage(files(base), { capabilityDescriptors: [descriptor()] })
    assert.deepEqual(explicit.capabilities, { complete: true, unresolved: [] })

    const wrongName = loadPortablePackage(files({ ...base, 'capabilities/example/stripes/v2.json': descriptor() }))
    assert.ok(codes(wrongName).includes('invalid-descriptor'), 'a descriptor file is named by its id and version')
    const badOption = loadPortablePackage(files({ ...base, 'definition.json': pkg({ capabilities: [{ ...pkg().capabilities[0], options: { count: 99 } }] }) }),
        { capabilityDescriptors: [descriptor()] })
    assert.ok(codes(badOption).includes('invalid-option'))
    assert.deepEqual(loadPortablePackage(files(base), { capabilityDescriptors: null }).diagnostics, [], 'no descriptors is an empty list')
})

test('a descriptor is read through its data properties only: an accessor, a symbol or an object of another kind is refused, and nothing is called', () => {
    let reads = 0
    const withGetter = descriptor()
    Object.defineProperty(withGetter, 'description', { enumerable: true, get() { reads++; return 'drawn' } })
    has(normalizeCapabilityDescriptor(withGetter), 'accessor-value', 'description')
    assert.equal(reads, 0, 'the getter is never called')
    has(normalizeCapabilityDescriptor(descriptor({ options: { style: { type: 'string', enum: [Symbol('soft')] } } })), 'invalid-value', 'options.style.enum.0')
    has(normalizeCapabilityDescriptor(descriptor({ options: new Map() })), 'invalid-value', 'options')
    has(normalizeCapabilityDescriptor(descriptor({ version: Infinity })), 'invalid-value', 'version')
    const looped = descriptor()
    looped.options.self = looped.options
    has(normalizeCapabilityDescriptor(looped), 'invalid-value', 'options.self')
    const read = normalizeCapabilityDescriptor(descriptor())
    assert.notEqual(read.descriptor.options, descriptor().options, 'the descriptor read is a copy')
    assert.deepEqual(read.descriptor, descriptor())

    // An array is its indices only: a hole, or a key that is not an index, is refused.
    has(normalizeCapabilityDescriptor(descriptor({ options: { style: { type: 'string', enum: ['soft', , 'hard'] } } })), 'invalid-value', 'options.style.enum')
    const extra = ['soft', 'hard']
    extra.foo = 'bar'
    has(normalizeCapabilityDescriptor(descriptor({ options: { style: { type: 'string', enum: extra } } })), 'invalid-value', 'options.style.enum')

    // A Proxy's traps run, as any read of it does; an error from one is a diagnostic, not a throw.
    const hostile = new Proxy({}, { ownKeys() { throw new Error('trap') } })
    assert.deepEqual(codes(normalizeCapabilityDescriptor(hostile)), ['invalid-value'])

    // An object used in two places is read once, so sharing costs nothing.
    let shared = ['soft']
    for (let level = 0; level < 40; level++) shared = [shared, shared]
    const started = Date.now()
    const sharing = normalizeCapabilityDescriptor(descriptor({ options: { style: { type: 'array', enum: [shared] } } }))
    assert.deepEqual(sharing.diagnostics, [])
    assert.ok(Date.now() - started < 1000, 'a shared value is read once, not once per use')
})

test('a package or a descriptor nested too deep is refused, and reading it never throws', () => {
    let deep = 'soft'
    for (let level = 0; level < 5000; level++) deep = [deep]
    const nested = normalizeCapabilityDescriptor(descriptor({ options: { style: { type: 'array', enum: [deep] } } }))
    assert.deepEqual(codes(nested), ['too-deep'])
    assert.ok(nested.diagnostics[0].path.startsWith('options.style.enum.0.0'), nested.diagnostics[0].path)
    // The files hold the deep value as JSON text, written out level by level.
    const deepText = `${'['.repeat(5000)}"soft"${']'.repeat(5000)}`
    const base = { 'definition.json': pkg(), 'glsl/blend.glsl': FRAGMENT }
    const descriptorText = JSON.stringify(descriptor({ options: { style: { type: 'array', enum: ['DEEP'] } } })).replace('"DEEP"', deepText)
    const carried = loadPortablePackage(files({ ...base, 'capabilities/example/stripes/v1.json': descriptorText }))
    assert.ok(codes(carried).includes('too-deep'), 'a deep descriptor file is a diagnostic')
    const definitionText = JSON.stringify(pkg({ description: 'DEEP' })).replace('"DEEP"', deepText)
    const definition = loadPortablePackage(files({ ...base, 'definition.json': definitionText }))
    assert.ok(codes(definition).includes('too-deep'), 'a deep definition.json is a diagnostic')
})

test('an option schema is checked as the values it describes will be', () => {
    const option = schema => normalizeCapabilityDescriptor(descriptor({ options: { value: schema } }))
    has(option({ type: 'string', minimum: 3 }), 'invalid-value', 'options.value.minimum')
    has(option({ type: 'integer', minimum: 5, maximum: 2 }), 'invalid-value', 'options.value.minimum')
    has(option({ type: 'number', enum: ['a'] }), 'invalid-value', 'options.value.enum.0')
    has(option({ type: 'object', properties: { '2nd': { type: 'number' } } }), 'invalid-name', 'options.value.properties.2nd')
    has(normalizeCapabilityDescriptor(descriptor({ methods: ['setStripeCount', 'setStripeCount'] })), 'duplicate-name', 'methods.1')
    has(normalizeCapabilityDescriptor(descriptor({ methods: ['capabilities'] })), 'invalid-name', 'methods.0')
    has(normalizeCapabilityDescriptor(descriptor({ dependencies: { parameters: ['seed', 'seed'], resources: [] } })), 'duplicate-name', 'dependencies.parameters.1')
    // An enum compares values whatever the order of their keys.
    const keyed = descriptor({ options: { count: { type: 'integer' }, shape: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, enum: [{ a: 1, b: 2 }] } } })
    const definition = normalizePortableDefinition(pkg({ capabilities: [{ ...pkg().capabilities[0], options: { count: 2, shape: { b: 2, a: 1 } } }] })).definition
    assert.deepEqual(checkCapabilityDeclarations(definition, [keyed]).diagnostics, [])
})

test('a list of descriptors: one capability described twice is accepted when the two agree, refused when they differ', () => {
    const definition = normalizePortableDefinition(pkg()).definition
    assert.deepEqual(checkCapabilityDeclarations(definition, [descriptor(), descriptor()]).diagnostics, [])
    has(checkCapabilityDeclarations(definition, [descriptor(), descriptor({ description: 'other' })]), 'conflicting-descriptor', 'capabilityDescriptors.1')
    has(checkCapabilityDeclarations(definition, ['not a descriptor']), 'invalid-value', 'capabilityDescriptors.0')

    const base = { 'definition.json': pkg(), 'glsl/blend.glsl': FRAGMENT, 'capabilities/example/stripes/v1.json': descriptor() }
    const agreeing = loadPortablePackage(files(base), { capabilityDescriptors: [descriptor()] })
    assert.deepEqual(agreeing.diagnostics, [], 'the package carries the descriptor that the host gives')
    assert.deepEqual(agreeing.capabilityDescriptors, [descriptor()], 'the result holds each descriptor once, as read')
    const differing = loadPortablePackage(files(base), { capabilityDescriptors: [descriptor({ description: 'the host\'s' })] })
    has(differing, 'conflicting-descriptor', 'capabilities/example/stripes/v1.json')
    assert.match(differing.diagnostics[0].message, /capabilityDescriptors\.0/, 'the message names the descriptor it differs from')
})

test('a package reports its definition and its descriptor files together, the definition first', () => {
    const result = loadPortablePackage(files({
        'definition.json': pkg({ colour: 'red' }),
        'glsl/blend.glsl': FRAGMENT,
        'capabilities/example/stripes.json': descriptor(),
    }))
    assert.equal(result.profile, 'v2')
    assert.deepEqual(result.diagnostics.map(entry => [entry.code, entry.path]),
        [['unknown-field', 'colour'], ['invalid-descriptor', 'capabilities/example/stripes.json']])
})

test('a legacy package and a JS definition are unchanged: capabilities belong to version 2 packages', async () => {
    const legacy = {
        'definition.json': { func: 'legacyIcons', passes: [{ program: 'blend', inputs: {}, outputs: { fragColor: 'outputTex' } }] },
        'glsl/blend.glsl': FRAGMENT,
        'capabilities/icon.png': 'png bytes',
    }
    const loaded = loadPortablePackage(files(legacy))
    assert.deepEqual(loaded.diagnostics, [])
    assert.equal(loaded.profile, 'legacy')
    assert.ok(loaded.assets.has('capabilities/icon.png'), 'a legacy package keeps a file under capabilities/ as an asset')

    const renderer = new CanvasRenderer()
    await renderer.registerPortableEffect({
        namespace: 'user', func: 'legacyCapabilityField', globals: {},
        passes: [{ name: 'main', program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } }],
        shaders: { main: { glsl: FRAGMENT } },
        capabilities: [{ id: 'example/stripes', version: 1 }],
    })
    assert.ok(getEffect('user.legacyCapabilityField'), 'a legacy package registers as before')

    const errors = validateEffectDefinition({ name: 'Plain', func: 'plain', passes: [{ program: 'p', inputs: {}, outputs: { fragColor: 'outputTex' } }], capabilities: [] })
    assert.ok(errors.includes("Unknown definition field 'capabilities'"), `a JS definition declares no capabilities: ${JSON.stringify(errors)}`)
})
