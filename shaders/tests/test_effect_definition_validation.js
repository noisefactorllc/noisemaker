import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateEffectDefinition } from '../src/runtime/effect-validator.js'
import { Effect } from '../src/runtime/effect.js'

// GAP-003: full definition-grammar validation contract.
//
// validateEffectDefinition(def) is a deterministic, side-effect-free structure
// check over the definition schema actually consumed by effect.js, expander.js,
// compiler.js, uniform packing (pipeline/backends), and the UI control layer.
// Public contract: returns an array of error strings; [] for valid input;
// never throws for malformed/null/array/non-object containers; never mutates
// the input; never invokes lifecycle hooks; never sorts globals.
//
// Declaration/schema validation is distinct from shader compilation, GPU
// capability checks, and runtime behavior: this validator proves structure
// only.

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// A complete, valid plain-object definition exercising the schema surface.
const validDefinition = () => ({
    name: 'Validator Probe',
    namespace: 'synth',
    func: 'validatorProbe',
    description: 'Used by the definition-validator tests',
    tags: ['noise', 'util'],
    openCategories: ['general'],
    defaultProgram: 'search synth\nvalidatorProbe().write(o0)',
    hidden: false,
    uniformLayout: {
        resolution: { slot: 0, components: 'xy' },
        time: { slot: 0, components: 'z' }
    },
    uniformLayouts: {
        alt: { amount: { slot: 0, components: 'x' } }
    },
    paramAliases: { amt: 'amount' },
    textures: {
        scratch: { width: 64, height: '100%', format: 'rgba16f' },
        scaled: { width: { param: 'volumeSize', power: 2, default: 1024 }, height: { screenDivide: 'zoom', default: 8 } }
    },
    globals: {
        amount: {
            type: 'float',
            default: 0.5,
            uniform: 'amount',
            min: 0,
            max: 1,
            step: 0.01,
            zero: 0,
            ui: { label: 'amount', control: 'slider', category: 'effect' }
        },
        mode: {
            type: 'int',
            default: 1,
            uniform: 'mode',
            define: 'PROBE_MODE',
            choices: { off: 0, on: 1, 'Group:': null },
            ui: { label: 'mode', control: 'dropdown', enabledBy: 'amount' }
        },
        flag: {
            type: 'boolean',
            default: true,
            uniform: 'flag',
            ui: { label: 'flag', control: 'checkbox', enabledBy: { param: 'mode', eq: 1 } }
        },
        tint: {
            type: 'color',
            default: [1, 0, 0],
            uniform: 'tint',
            ui: { label: 'tint', control: 'color' }
        },
        point: {
            type: 'vec3',
            default: [0, 0, 0],
            uniform: 'point',
            min: [-1, -1, -1],
            max: [1, 1, 1],
            ui: { label: 'point', control: 'vector3', format: 'x/y/z' }
        },
        table: {
            type: 'int',
            default: 7,
            choices: { a: 7, b: 9 },
            ui: { label: 'table', control: 'dropdown', hidden: true }
        },
        surfaceIn: {
            type: 'surface',
            default: 'none',
            colorModeUniform: 'surfaceActive',
            ui: { label: 'surface', control: false }
        }
    },
    passes: [
        {
            name: 'render',
            program: 'probe',
            type: 'compute',
            drawMode: 'points',
            count: 'input',
            countUniform: 'mode',
            repeat: 2,
            blend: ['ONE', 'ONE_MINUS_SRC_ALPHA'],
            drawBuffers: 2,
            workgroups: [8, 8, 1],
            viewport: { width: { param: 'volumeSize', paramDefault: 64 }, height: 32 },
            conditions: {
                runIf: [{ uniform: 'mode', equals: 1 }],
                skipIf: [{ uniform: 'flag', equals: false }]
            },
            uniforms: { amount: 'amount', literal: 3 },
            inputs: { srcTex: 'inputTex', scratchTex: 'scratch', paramTex: 'surfaceIn' },
            outputs: { fragColor: 'outputTex' }
        }
    ]
})

const validate = (def) => validateEffectDefinition(def)

test('null, undefined, array, and primitive containers produce errors without throwing', () => {
    assert.deepEqual(validate(null), ['Effect definition is null or undefined'])
    assert.deepEqual(validate(undefined), ['Effect definition is null or undefined'])
    for (const bad of [[], ['x'], 'string', 42, true]) {
        const errors = validate(bad)
        assert.ok(Array.isArray(errors), `expected array for ${JSON.stringify(bad)}`)
        assert.ok(errors.length > 0, `expected errors for ${JSON.stringify(bad)}`)
        for (const e of errors) assert.equal(typeof e, 'string')
    }
})

test('valid plain-object definition returns no errors', () => {
    assert.deepEqual(validate(validDefinition()), [])
})

test('unknown top-level declarative fields on plain objects are diagnosed', () => {
    const def = validDefinition()
    def.globalz = def.globals
    const errors = validate(def)
    assert.equal(errors.filter(e => /globalz/.test(e)).length, 1)
})

test('unknown global-spec, ui, pass, and texture-spec fields are diagnosed (including on instances)', () => {
    const def = validDefinition()
    def.globals.amount.unkown = 1 // typo field
    def.globals.mode.ui.colour = 'red'
    def.passes[0].progam = 'typo'
    def.textures.scratch.widht = 8
    const errors = validate(def)
    assert.equal(errors.filter(e => /unkown/.test(e)).length, 1)
    assert.equal(errors.filter(e => /colour/.test(e)).length, 1)
    assert.equal(errors.filter(e => /progam/.test(e)).length, 1)
    assert.equal(errors.filter(e => /widht/.test(e)).length, 1)
    // Nested diagnosis still applies to Effect instances.
    const inst = new Effect(validDefinition())
    inst.globals.amount.unkown = 1
    assert.equal(validate(inst).filter(e => /unkown/.test(e)).length, 1)
})

test('malformed containers are reported without throwing', () => {
    const cases = [
        def => { def.globals = ['nope'] },
        def => { def.globals = 'nope' },
        def => { def.globals = { g: null } },
        def => { def.globals = { g: [] } },
        def => { def.globals = { g: { type: 'float', default: 0.5, ui: 'slider' } } },
        def => { def.passes = { program: 'x' } },
        def => { def.passes = [null] },
        def => { def.passes = [{ program: 'p', inputs: 'x' }] },
        def => { def.passes = [{ program: 'p', outputs: 3 }] },
        def => { def.passes = [{ program: 'p', uniforms: 'x' }] },
        def => { def.passes = [{ program: 'p', conditions: 'always' }] },
        def => { def.passes = [{ program: 'p', conditions: { runIf: [null] } }] },
        def => { def.passes = [{ program: 'p', conditions: { runIf: [{ uniform: 7 }] } }] },
        def => { def.passes = [{ program: 'p', conditions: { runIf: [{ uniform: 'mode' }] } }] },
        def => { def.passes = [{ program: 'p', conditions: { runIf: [{ uniform: 'mode', equals: undefined }] } }] },
        def => { def.textures = ['x'] },
        def => { def.textures = { t: 'big' } },
        def => { def.textures = { t: { width: 'banana' } } },
        def => { def.textures = { t: { width: { param: 42 } } } },
        def => { def.textures = { t: { width: { wrong: 1 } } } },
        def => { def.textures = { t: { width: -4 } } },
        def => { def.textures = { t: { format: 'rgba999' } } },
        def => { def.uniformLayout = { u: { slot: 'x', components: 'x' } } },
        def => { def.uniformLayout = { u: { slot: 0, components: 'xyzwq' } } },
        def => { def.uniformLayout = { u: { slot: 0, components: 'zy' } } },
        def => { def.uniformLayout = { u: { slot: 0.5, components: 'x' } } },
        def => { def.uniformLayout = { u: { slot: 0, components: 'x' }, v: { slot: 0, components: 'y' }, w: { slot: 0, components: 'x' } } },
        def => { def.uniformLayouts = { p: 'layout' } },
        def => { def.paramAliases = 'aliases' },
        def => { def.paramAliases = { amt: 'nosuchglobal' } },
        def => { def.tags = 'noise' },
        def => { def.tags = ['not-a-tag'] },
        def => { def.tags = [42] },
        def => { def.openCategories = [7] },
        def => { def.onInit = 'nope' },
        def => { def.onUpdate = 42 },
        def => { def.onDestroy = {} },
        def => { def.asyncInit = true },
        def => { def.shaders = 'inline' },
        def => { def.shaders = { main: 'source' } },
        def => { def.deprecatedBy = 5 },
        def => { def.externalTexture = 7 }
    ]
    for (const mutate of cases) {
        const def = validDefinition()
        mutate(def)
        const errors = validate(def)
        assert.ok(errors.length > 0, `expected errors for mutation: ${mutate.toString()}`)
        for (const e of errors) assert.equal(typeof e, 'string', `non-string error for ${mutate.toString()}`)
    }
})

test('global spec type and primitive constraints are enforced', () => {
    const cases = [
        def => { def.globals.amount.type = 'vec9' },
        def => { def.globals.amount.type = 3 },
        def => { def.globals.amount.default = 'high' },
        def => { def.globals.amount.default = Number.NaN },
        def => { def.globals.amount.default = Number.POSITIVE_INFINITY },
        def => { def.globals.mode.default = 1.5 },
        def => { def.globals.mode.default = 'one' },
        def => { def.globals.flag.default = 1 },
        def => { def.globals.tint.default = [1, 0] },
        def => { def.globals.tint.default = [1, 0, 'a'] },
        def => { def.globals.point.default = [0, 0] },
        def => { def.globals.point.min = [-1, -1] },
        def => { def.globals.point.max = 1 },
        def => { def.globals.point.default = [0, 0, 2] },
        def => { def.globals.amount.min = 'low' },
        def => { def.globals.amount.max = Number.NaN },
        def => { def.globals.amount.min = 0.9 },
        def => { def.globals.amount.max = 0.4 },
        def => { def.globals.amount.step = 'x' },
        def => { def.globals.amount.zero = Number.NaN },
        def => { delete def.globals.mode.choices; def.globals.mode.choices = [0, 1] },
        def => { def.globals.mode.choices = { bad: 'x' } },
        def => { def.globals.mode.default = 5 },
        def => { def.globals.table.default = 8 },
        def => { def.globals.surfaceIn.colorModeUniform = 3 },
        def => { def.globals.amount.uniform = 9 },
        def => { def.globals.mode.define = 5 }
    ]
    for (const mutate of cases) {
        const def = validDefinition()
        mutate(def)
        const errors = validate(def)
        assert.ok(errors.length > 0, `expected errors for mutation: ${mutate.toString()}`)
    }
})

test('member-typed globals must resolve through the std enum tables', () => {
    const def = validDefinition()
    def.globals.memberProbe = {
        type: 'member',
        default: 'noSuchTable.member',
        enum: 'noSuchTable',
        ui: { label: 'member', control: 'dropdown' }
    }
    assert.ok(validate(def).some(e => /noSuchTable/.test(e)))

    const def2 = validDefinition()
    def2.globals.memberProbe = {
        type: 'member',
        default: 'oscType.sine',
        enum: 'oscType',
        ui: { label: 'member', control: 'dropdown' }
    }
    assert.deepEqual(validate(def2), [])
})

test('duplicate and conflicting bindings and layouts are diagnosed', () => {
    const def = validDefinition()
    def.globals.other = { type: 'float', default: 0, uniform: 'amount' }
    const errors = validate(def)
    assert.ok(errors.some(e => /amount/.test(e) && /conflict|duplicate/i.test(e)))

    const def2 = validDefinition()
    def2.uniformLayout = { a: { slot: 1, components: 'x' }, b: { slot: 1, components: 'xy' } }
    assert.ok(validate(def2).some(e => /slot 1/.test(e)))

    const def3 = validDefinition()
    def3.uniformLayout = { a: { slot: 1, components: 'x' }, b: { slot: 1, components: 'x' } }
    assert.ok(validate(def3).length > 0)
})

test('unsupported binding references are diagnosed', () => {
    const cases = [
        def => { def.passes[0].inputs.bad = 7 },
        def => { def.passes[0].inputs.bad = 'notDeclaredAnywhere' },
        def => { def.passes[0].outputs.bad = 'notDeclaredAnywhere' },
        def => { def.passes[0].uniforms.bad = [] },
        def => { def.passes[0].uniforms.bad = { ref: 1 } },
        def => { def.passes[0].conditions.runIf = [{ uniform: 'nosuch', equals: 1 }] },
        def => { def.passes[0].countUniform = 'nosuch' },
        def => { def.passes[0].count = 'banana' },
        def => { def.passes[0].count = -1 },
        def => { def.passes[0].repeat = [] },
        def => { def.passes[0].drawMode = 'hexagons' },
        def => { def.passes[0].type = 'vertex' },
        def => { def.passes[0].drawBuffers = 0 },
        def => { def.passes[0].blend = 'on' },
        def => { def.passes[0].blend = ['ONE'] },
        def => { def.passes[0].workgroups = '8' },
        def => { def.passes[0].viewport = 32 },
        def => { def.passes[0].entryPoint = 7 },
        def => { def.globals.flag.ui.enabledBy = { param: 'nosuch', eq: 1 } },
        def => { def.globals.flag.ui.enabledBy = 'nosuch' },
        def => { def.globals.flag.ui.enabledBy = { param: 'mode' } },
        def => { def.globals.flag.ui.enabledBy = { and: 'x' } },
        def => { def.globals.mode.ui.control = 'dropdownx' },
        def => { def.globals.mode.ui.label = 7 }
    ]
    for (const mutate of cases) {
        const def = validDefinition()
        mutate(def)
        const errors = validate(def)
        assert.ok(errors.length > 0, `expected errors for mutation: ${mutate.toString()}`)
    }
})

test('numeric pass-uniform literals and supported dimension expressions are preserved', () => {
    const def = validDefinition()
    assert.deepEqual(validate(def), [])
    // Numeric literal in pass uniforms must never be diagnosed as a bad reference.
    def.passes[0].uniforms.literal = 0
    def.passes[0].uniforms.another = 12.5
    assert.deepEqual(validate(def), [])
    // Supported dimension expression forms.
    def.textures.expressions = {
        width: { scale: 0.5, clamp: { min: 8, max: 256 } },
        height: { param: 'volumeSize', multiply: 2, paramDefault: 64 }
    }
    assert.deepEqual(validate(def), [])
})

test('validator does not invoke lifecycle hooks', () => {
    let calls = 0
    const def = validDefinition()
    def.onInit = () => { calls++ }
    def.onUpdate = () => { calls++ }
    def.onDestroy = () => { calls++ }
    def.asyncInit = () => { calls++ }
    assert.deepEqual(validate(def), [])
    assert.equal(calls, 0)
})

test('validator never mutates the definition', () => {
    const def = validDefinition()
    const before = JSON.stringify(def)
    assert.deepEqual(validate(def), [])
    assert.equal(JSON.stringify(def), before)

    // Frozen input: validation reads only.
    const frozen = Object.freeze(validDefinition())
    assert.deepEqual(validate(frozen), [])
})

test('validation errors follow declaration insertion order, not sorted order', () => {
    const def = validDefinition()
    def.globals = {
        zzz: { type: 'float', default: 'bad' },
        aaa: { type: 'float', default: 'bad' }
    }
    const errors = validate(def)
    const z = errors.findIndex(e => /'zzz'/.test(e))
    const a = errors.findIndex(e => /'aaa'/.test(e))
    assert.ok(z !== -1 && a !== -1, `expected both global errors, got: ${errors.join(' | ')}`)
    assert.ok(z < a, `expected zzz before aaa in insertion order, got: ${errors.join(' | ')}`)
})

test('legitimate Effect subclass instance state is not rejected', () => {
    class Probe extends Effect {
        constructor() {
            super(validDefinition())
            this.counter = 0
            this.runtimeCache = new Map()
        }

        onInit() { this.counter += 1 }
    }
    const instance = new Probe()
    const errors = validate(instance)
    assert.deepEqual(errors, [])
})

test('Effect class instances validate through the full schema', () => {
    const instance = new Effect(validDefinition())
    assert.deepEqual(validate(instance), [])
    instance.globals.amount.default = 'oops'
    assert.ok(validate(instance).some(e => /amount|default/.test(e)))
})

test('dynamic definition corpus: every tracked effect validates with explicit denominators', async () => {
    const effectsRoot = path.resolve(__dirname, '../effects')
    const files = []
    const walk = dir => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.name === 'definition.js') files.push(full)
        }
    }
    walk(effectsRoot)
    files.sort()

    const expected = files.length
    assert.ok(expected > 0, 'expected a nonempty tracked definition inventory')

    const failures = []
    let executed = 0
    let passed = 0
    for (const file of files) {
        const id = path.relative(effectsRoot, file)
        let def = null
        try {
            const imported = await import(file)
            def = imported.default
        } catch (error) {
            // Import errors are failures, not skips.
            failures.push(`${id}: import failed: ${error && error.message}`)
            continue
        }
        if (typeof def === 'function') {
            // Effect subclass constructor: validate a constructed instance.
            try {
                def = new def()
            } catch (error) {
                failures.push(`${id}: instantiation failed: ${error && error.message}`)
                continue
            }
        }
        executed += 1
        try {
            const errors = validateEffectDefinition(def)
            if (errors.length > 0) {
                failures.push(`${id}: ${errors.length} error(s): ${errors.join(' | ')}`)
            } else {
                passed += 1
            }
        } catch (error) {
            failures.push(`${id}: validator threw: ${error && error.message}`)
        }
    }

    const unexecuted = expected - executed
    const skipped = 0
    console.log(`[gap-003 corpus] expected=${expected} executed=${executed} pass=${passed} failure=${failures.length} skip=${skipped} unexecuted=${unexecuted}`)
    for (const failure of failures) console.log(`[gap-003 corpus] ${failure}`)

    assert.equal(unexecuted, 0, 'every tracked definition must be executed; import errors are failures')
    assert.equal(failures.length, 0, 'every tracked definition must validate cleanly')
    assert.equal(passed, expected)
})
