/**
 * Regression tests for the unified backend diagnostic union.
 *
 * Before the fix the WebGL2 and WebGPU backends threw ad-hoc plain object
 * literals (`{ code, detail, ... }`) from their compile/link paths and the
 * WebGPU bind-group retry re-parsed raw browser error strings with inline
 * regexes. These tests pin the normalized `ShaderDiagnostic` union surfaced
 * through the public backend entry points:
 *   - both backends throw `ShaderDiagnostic` instances (real `Error`s) with
 *     `code`, `backend`, `stage`, `program`, `detail`, and a parsed
 *     `messages` array derived from the browser/compiler strings;
 *   - the legacy `detail` text stays byte-identical so existing consumers
 *     (`err.detail || err.message` fallbacks) keep their output;
 *   - the bind-group retry consumes the structured union (parsed
 *     `bindingIndex`) instead of string matching.
 *
 * Run:  node shaders/tests/test_backend_diagnostics.js
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'
import { WebGPUBackend } from '../src/runtime/backends/webgpu.js'
import {
    ShaderDiagnostic,
    parseGLSLInfoLog
} from '../src/runtime/backends/diagnostics.js'
import { Pipeline } from '../src/runtime/pipeline.js'

// ---------------------------------------------------------------------------
// WebGL2 stub GL context (Proxy-based, per the gl-error-gating test pattern)
// ---------------------------------------------------------------------------

function createStubGL({ shaderLog = '', linkLog = '', fragmentCompileOk = true, linkOk = true, uniformBlocks = null, getErrorValues = null } = {}) {
    const cache = new Map()
    let nextConst = 1
    const errorQueue = getErrorValues ? [...getErrorValues] : null

    const gl = new Proxy({}, {
        get(_target, prop) {
            if (cache.has(prop)) return cache.get(prop)

            let value
            if (prop === 'NO_ERROR') {
                value = 0
            } else if (prop === 'getError') {
                value = errorQueue
                    ? () => (errorQueue.length > 0 ? errorQueue.shift() : 0)
                    : () => 0
            } else if (prop === 'shaderSource') {
                // The probe source contains 'void main()'; compiling it fails
                // so compile failures surface through getShaderParameter.
                value = (shader, source) => {
                    cache.set('_probeFails', String(source).includes('void main()'))
                }
            } else if (prop === 'getShaderParameter') {
                value = () => (cache.get('_probeFails') ? fragmentCompileOk : true)
            } else if (prop === 'getShaderInfoLog') {
                value = () => shaderLog
            } else if (prop === 'getProgramParameter') {
                value = (_program, pname) => {
                    if (pname === gl.LINK_STATUS) return linkOk
                    if (uniformBlocks && pname === gl.ACTIVE_UNIFORM_BLOCKS) return 1
                    return 0
                }
            } else if (prop === 'getParameter') {
                value = pname => (uniformBlocks && pname === gl.MAX_UNIFORM_BLOCK_SIZE
                    ? uniformBlocks.maxBlockSize
                    : undefined)
            } else if (prop === 'getActiveUniformBlockName') {
                value = () => (uniformBlocks ? uniformBlocks.name : null)
            } else if (prop === 'getActiveUniformBlockParameter') {
                value = (_program, _index, pname) => (uniformBlocks && pname === gl.UNIFORM_BLOCK_DATA_SIZE
                    ? uniformBlocks.declaredSize
                    : 0)
            } else if (prop === 'getProgramInfoLog') {
                value = () => linkLog
            } else if (prop === 'getAttribLocation' || prop === 'getUniformLocation') {
                value = () => -1
            } else if (prop === 'createProgram' || prop === 'createShader'
                || prop === 'createBuffer' || prop === 'createVertexArray') {
                value = () => ({})
            } else if (prop === 'canvas') {
                value = null
            } else if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') {
                value = 8
            } else if (typeof prop === 'string' && /^[A-Z][A-Z0-9_]*$/.test(prop)) {
                value = nextConst++
            } else {
                value = () => undefined
            }

            cache.set(prop, value)
            return value
        }
    })

    return gl
}

// ---------------------------------------------------------------------------
// WebGPU stub device
// ---------------------------------------------------------------------------

function createStubGPUDevice({ messages = [] } = {}) {
    const calls = []
    const device = {
        queue: {},
        addEventListener() {},
        createShaderModule(descriptor) {
            calls.push(['createShaderModule', descriptor])
            return {
                getCompilationInfo: async () => ({ messages })
            }
        },
        createBindGroup(descriptor) {
            calls.push(['createBindGroup', descriptor])
            return { kind: 'bind-group' }
        },
        createBindGroupLayout(descriptor) {
            calls.push(['createBindGroupLayout', descriptor])
            return { kind: 'bind-group-layout' }
        }
    }
    device.calls = calls
    device.listeners = {}
    const originalAddEventListener = device.addEventListener.bind(device)
    device.addEventListener = (type, fn) => {
        device.listeners[type] = fn
        return originalAddEventListener(type, fn)
    }
    return device
}

// ---------------------------------------------------------------------------
// Part 1: WebGL2 compile / link / missing-source diagnostics
// ---------------------------------------------------------------------------

test('WebGL2 compile failure surfaces one structured ShaderDiagnostic', async () => {
    const log = "ERROR: 0:5: 'foo' : syntax error\nERROR: 0:12: 'bar' : undeclared identifier\nWARNING: 0:20: something dodgy"
    const gl = createStubGL({ fragmentCompileOk: false, shaderLog: log })
    const backend = new WebGL2Backend(gl, null)

    await assert.rejects(
        () => backend.compileProgram('prog0', { source: 'void main() {}' }),
        err => {
            assert.ok(err instanceof ShaderDiagnostic, 'expected a ShaderDiagnostic instance')
            assert.ok(err instanceof Error, 'diagnostic must be a real Error')
            assert.equal(err.name, 'ShaderDiagnostic')
            assert.equal(err.code, 'ERR_SHADER_COMPILE')
            assert.equal(err.backend, 'webgl2')
            assert.equal(err.stage, 'compile')
            assert.equal(err.detail, log, 'legacy detail text must stay byte-identical')
            assert.deepEqual(err.messages, [
                { severity: 'error', line: 5, column: undefined, message: "'foo' : syntax error" },
                { severity: 'error', line: 12, column: undefined, message: "'bar' : undeclared identifier" },
                { severity: 'warning', line: 20, column: undefined, message: 'something dodgy' }
            ])
            assert.equal(err.source.includes('void main()'), true, 'compile diagnostics echo the offending source')
            return true
        }
    )
})

test('WebGL2 link failure surfaces a structured diagnostic with the program id', async () => {
    const log = 'ERROR: One or more attached shaders not successfully compiled'
    const gl = createStubGL({ linkOk: false, linkLog: log })
    const backend = new WebGL2Backend(gl, null)

    await assert.rejects(
        () => backend.compileProgram('prog1', { source: 'void main() {}', vertex: 'void main() {}' }),
        err => {
            assert.ok(err instanceof ShaderDiagnostic)
            assert.equal(err.code, 'ERR_SHADER_LINK')
            assert.equal(err.backend, 'webgl2')
            assert.equal(err.stage, 'link')
            assert.equal(err.program, 'prog1')
            assert.equal(err.detail, log)
            // Program info logs carry prose without line prefixes, so the
            // parser preserves them as info entries rather than dropping them.
            assert.deepEqual(err.messages, [
                { severity: 'info', line: undefined, column: undefined, message: log }
            ])
            return true
        }
    )
})

test('WebGL2 missing shader source keeps its legacy message and gains structure', async () => {
    const gl = createStubGL()
    const backend = new WebGL2Backend(gl, null)

    await assert.rejects(
        () => backend.compileProgram('prog2', {}),
        err => {
            assert.ok(err instanceof ShaderDiagnostic)
            assert.equal(err.code, 'ERR_SHADER_MISSING')
            assert.equal(err.backend, 'webgl2')
            assert.equal(err.stage, 'missing-source')
            assert.equal(err.program, 'prog2')
            assert.equal(
                err.message,
                "Shader source missing for program 'prog2'. You may need to regenerate the shader manifest.",
                'legacy message must stay byte-identical'
            )
            return true
        }
    )
})

// ---------------------------------------------------------------------------
// Part 2: GLSL info-log parser (browser/compiler string -> structured union)
// ---------------------------------------------------------------------------

test('parseGLSLInfoLog parses ERROR/WARNING lines and passes through prose', () => {
    const messages = parseGLSLInfoLog(
        'ERROR: 0:3: bad thing\n'
        + 'WARNING: 1:7: mild thing\n'
        + 'some driver prose without a prefix'
    )
    assert.deepEqual(messages, [
        { severity: 'error', line: 3, column: undefined, message: 'bad thing' },
        { severity: 'warning', line: 7, column: undefined, message: 'mild thing' },
        { severity: 'info', line: undefined, column: undefined, message: 'some driver prose without a prefix' }
    ])
})

// ---------------------------------------------------------------------------
// Part 3: WebGPU compile diagnostics
// ---------------------------------------------------------------------------

test('WebGPU compile failure surfaces one structured ShaderDiagnostic', async () => {
    const device = createStubGPUDevice({
        messages: [
            { type: 'error', lineNum: 4, linePos: 9, message: 'cannot infer type' },
            { type: 'warning', lineNum: 8, linePos: 1, message: 'unused variable' }
        ]
    })
    const backend = new WebGPUBackend(device, {
        configuration: { device },
        getConfiguration() { return this.configuration }
    })

    await assert.rejects(
        () => backend.compileProgram('wprog0', { wgsl: '@fragment\nfn main() {}' }),
        err => {
            assert.ok(err instanceof ShaderDiagnostic)
            assert.equal(err.code, 'ERR_SHADER_COMPILE')
            assert.equal(err.backend, 'webgpu')
            assert.equal(err.stage, 'compile')
            assert.equal(err.program, 'wprog0')
            assert.equal(err.detail, 'Line 4: cannot infer type',
                'legacy detail text must stay byte-identical (error entries only)')
            assert.deepEqual(err.messages, [
                { severity: 'error', line: 4, column: 9, message: 'cannot infer type' }
            ])
            return true
        }
    )
})

test('WebGPU missing WGSL source keeps its legacy detail and gains structure', async () => {
    const device = createStubGPUDevice()
    const backend = new WebGPUBackend(device, {
        configuration: { device },
        getConfiguration() { return this.configuration }
    })

    await assert.rejects(
        () => backend.compileProgram('wprog1', { glsl: 'not wgsl' }),
        err => {
            assert.ok(err instanceof ShaderDiagnostic)
            assert.equal(err.code, 'ERR_NO_WGSL_SOURCE')
            assert.equal(err.backend, 'webgpu')
            assert.equal(err.stage, 'missing-source')
            assert.equal(err.program, 'wprog1')
            assert.equal(
                err.detail,
                "No WGSL shader source found for program 'wprog1'. Available keys: glsl",
                'legacy detail text must stay byte-identical'
            )
            return true
        }
    )
})

// ---------------------------------------------------------------------------
// Part 4: WebGPU bind-group retry consumes the structured diagnostic union
// ---------------------------------------------------------------------------

function bindGroupBackend(device) {
    const backend = new WebGPUBackend(device, {
        configuration: { device },
        getConfiguration() { return this.configuration }
    })
    return { backend }
}

test('bind-group retry filters the parsed binding index through the union', async () => {
    const device = createStubGPUDevice()
    let createCalls = 0
    device.createBindGroup = descriptor => {
        createCalls++
        if (createCalls === 1) {
            throw new Error('binding index 2 not present in the bind group layout')
        }
        assert.deepEqual(descriptor.entries, [{ binding: 0, resource: {} }],
            'retry must drop the parsed problem binding')
        return { kind: 'bind-group', descriptor }
    }
    const { backend } = bindGroupBackend(device)
    const layout = { kind: 'layout' }

    const bindGroup = await backend.createBindGroupFromEntries(layout, [
        { binding: 0, resource: {} },
        { binding: 2, resource: {} }
    ])

    assert.ok(bindGroup, 'retry must succeed after filtering the parsed binding')
    assert.equal(createCalls, 2, 'exactly one retry after the binding-index diagnostic')
})

test('bind-group creation without a binding-index diagnostic is not retried', async () => {
    const device = createStubGPUDevice()
    let calls = 0
    device.createBindGroup = () => {
        calls++
        throw new Error('some unrelated validation failure')
    }
    const { backend } = bindGroupBackend(device)

    await assert.rejects(
        async () => backend.createBindGroupFromEntries({ kind: 'layout' }, [{ binding: 0, resource: {} }]),
        err => {
            assert.equal(err.message, 'some unrelated validation failure')
            return true
        }
    )
    assert.equal(calls, 1, 'unrelated errors must not enter the retry loop')
})

// ---------------------------------------------------------------------------
// Part 5: the WebGL2 uniform-block
// device-limit throw and the silent WebGL format / dimension fallbacks
// ---------------------------------------------------------------------------

test('WebGL2 uniform-block device-limit failure surfaces the structured union', async () => {
    const gl = createStubGL({
        uniformBlocks: { name: 'Scene', declaredSize: 1048576, maxBlockSize: 16384 }
    })
    const backend = new WebGL2Backend(gl, null)

    await assert.rejects(
        () => backend.compileProgram('progUB', {
            source: 'void main() {}',
            vertex: 'void main() {}',
            uniformLayout: { Scene: { slot: 0 } }
        }),
        err => {
            assert.ok(err instanceof ShaderDiagnostic,
                'expected a ShaderDiagnostic, got an ad-hoc plain-object throw')
            assert.ok(err instanceof Error)
            assert.equal(err.code, 'ERR_UNIFORM_BLOCK_TOO_LARGE')
            assert.equal(err.backend, 'webgl2')
            assert.equal(err.stage, 'uniform-block')
            assert.ok(err.program !== undefined && typeof err.program === 'object',
                'legacy throw passed the raw GL program handle; that surface is preserved')
            assert.equal(
                err.detail,
                'Uniform block Scene requires 1048576 bytes; device limit is 16384',
                'legacy detail text must stay byte-identical'
            )
            assert.deepEqual(err.messages, [
                {
                    severity: 'info',
                    line: undefined,
                    column: undefined,
                    message: 'Uniform block Scene requires 1048576 bytes; device limit is 16384'
                }
            ])
            // Legacy enumerable surface preserved for the err.detail/JSON
            // serialization fallbacks in pipeline.js/canvas.js.
            const json = JSON.parse(JSON.stringify(err))
            assert.equal(json.code, 'ERR_UNIFORM_BLOCK_TOO_LARGE')
            assert.equal(json.detail, err.detail)
            assert.ok(json.program !== undefined, 'legacy program field stays enumerable')
            return true
        }
    )
})

test('WebGL2 unknown texture format keeps the rgba8 fallback but records a structured diagnostic', () => {
    const gl = createStubGL()
    const backend = new WebGL2Backend(gl, null)

    const warnings = []
    const originalWarn = console.warn
    console.warn = message => warnings.push(String(message))
    try {
        const resolved = backend.resolveFormat('banana')
        assert.deepEqual(
            resolved,
            { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE },
            'behavior unchanged: unknown formats still resolve to rgba8'
        )

        assert.equal(backend.diagnostics.records.length, 1)
        const record = backend.diagnostics.records[0]
        assert.equal(record.code, 'ERR_UNKNOWN_FORMAT_FALLBACK')
        assert.equal(record.backend, 'webgl2')
        assert.equal(record.stage, 'texture-create')
        assert.equal(record.format, 'banana')
        assert.equal(record.fallback, 'rgba8')

        backend.resolveFormat('banana')
        assert.equal(backend.diagnostics.records.length, 1, 'the same fallback is deduplicated')
        assert.equal(warnings.length, 1, 'the warning is emitted once per unknown format')

        backend.resolveFormat('rgba16f')
        assert.equal(backend.diagnostics.records.length, 1, 'known formats add no diagnostic')

        backend.resolveFormat(undefined)
        assert.equal(backend.diagnostics.records.length, 1, 'an absent format is the default, not a fallback')
    } finally {
        console.warn = originalWarn
    }
})

test('WebGL2 resolves the WebGPU spellings of supported formats without a fallback', () => {
    // filter/bloom (rgba16float) and points/buddhabrot (rgba32float) used to
    // fall back to rgba8 on WebGL2 only.
    const gl = createStubGL()
    const backend = new WebGL2Backend(gl, null)
    const originalWarn = console.warn
    const warnings = []
    console.warn = message => warnings.push(String(message))
    try {
        const pairs = [
            ['rgba8unorm', 'rgba8'], ['rgba16float', 'rgba16f'], ['rgba32float', 'rgba32f'],
            ['r8unorm', 'r8'], ['r16float', 'r16f'], ['r32float', 'r32f'],
        ]
        for (const [alias, canonical] of pairs) {
            assert.deepEqual(backend.resolveFormat(alias), backend.resolveFormat(canonical), alias)
        }
        assert.equal(backend.diagnostics.records.length, 0, 'no fallback diagnostic')
        assert.deepEqual(warnings, [], 'no fallback warning')
    } finally {
        console.warn = originalWarn
    }
})

test('Pipeline unknown dimension form keeps the screen-size fallback but records a structured diagnostic', () => {
    const pipeline = new Pipeline({ passes: [], textures: new Map() }, {})

    const warnings = []
    const originalWarn = console.warn
    console.warn = message => warnings.push(String(message))
    try {
        assert.equal(
            pipeline.resolveDimension('zoom', 1000),
            1000,
            'behavior unchanged: unknown forms resolve to screen size'
        )
        assert.equal(pipeline.diagnostics.records.length, 1)
        const record = pipeline.diagnostics.records[0]
        assert.equal(record.code, 'ERR_DIMENSION_FALLBACK')
        assert.equal(record.stage, 'dimension')
        assert.equal(record.spec, 'zoom')
        assert.equal(record.fallback, 'screen')

        pipeline.resolveDimension('zoom', 1000)
        assert.equal(pipeline.diagnostics.records.length, 1, 'the same fallback is deduplicated')
        assert.equal(warnings.length, 1, 'the warning is emitted once per unknown spec')

        pipeline.resolveDimension({ bogus: true }, 1000)
        assert.equal(pipeline.diagnostics.records.length, 2, 'each distinct unknown form is recorded once')

        for (const spec of ['screen', 'auto', 'input', 'resolution', 64, '50%', { param: 'x' }, { screenDivide: 'z' }, { scale: 0.5 }, undefined]) {
            pipeline.resolveDimension(spec, 1000)
        }
        assert.equal(pipeline.diagnostics.records.length, 2, 'recognized forms and absent specs add no diagnostic')
        assert.equal(warnings.length, 2)
    } finally {
        console.warn = originalWarn
    }
})

// ---------------------------------------------------------------------------
// Part 6: the runtime resource and device-validation bypass paths — WebGL2
// missing-FBO/MRT warnings, post-draw gl.getError() draining, and WebGPU
// `uncapturederror` — recorded (non-throwing) in backend.diagnostics
// ---------------------------------------------------------------------------

test('WebGL2 missing render-target paths record structured diagnostics without changing behavior', () => {
    const gl = createStubGL()
    const backend = new WebGL2Backend(gl, null)
    backend.programs.set('prog', { handle: {} })
    backend.textures.set('t1', { handle: {}, width: 8, height: 8 })
    const state = {}

    const warnings = []
    const originalWarn = console.warn
    console.warn = (...args) => warnings.push(args.map(String).join(' '))
    try {
        // Single-output pass whose FBO was never created
        backend.executePass({ id: 'p1', program: 'prog', outputs: { color: 't1' } }, state)
        // MRT pass whose output textures were never created
        backend.executePass({ id: 'p2', program: 'prog', outputs: { a: 't9', b: 't10' }, drawBuffers: 2 }, state)

        assert.equal(backend.diagnostics.records.length, 3)
        assert.deepEqual(
            { ...backend.diagnostics.records[0] },
            {
                code: 'ERR_MISSING_RENDER_TARGET',
                backend: 'webgl2',
                stage: 'render',
                kind: 'fbo',
                pass: 'p1',
                output: 't1'
            }
        )
        assert.deepEqual(
            { ...backend.diagnostics.records[1] },
            {
                code: 'ERR_MISSING_RENDER_TARGET',
                backend: 'webgl2',
                stage: 'render',
                kind: 'mrt',
                pass: 'p2',
                output: 't9'
            }
        )
        assert.deepEqual(
            { ...backend.diagnostics.records[2] },
            {
                code: 'ERR_MISSING_RENDER_TARGET',
                backend: 'webgl2',
                stage: 'render',
                kind: 'mrt',
                pass: 'p2',
                output: 't10'
            }
        )

        // Legacy console behavior unchanged: every occurrence still warns.
        const firstRound = warnings.length
        assert.equal(firstRound, 3, 'one warn per missing target (1 fbo + 2 mrt)')
        backend.executePass({ id: 'p1', program: 'prog', outputs: { color: 't1' } }, state)
        backend.executePass({ id: 'p2', program: 'prog', outputs: { a: 't9', b: 't10' }, drawBuffers: 2 }, state)
        assert.equal(warnings.length, firstRound * 2, 'warnings still fire on every occurrence')
        assert.equal(backend.diagnostics.records.length, 3, 'records are deduplicated per target')
    } finally {
        console.warn = originalWarn
    }
})

test('WebGL2 post-draw GL errors record a structured diagnostic alongside the drained log', () => {
    const gl = createStubGL({ getErrorValues: [0, 1284] })
    const backend = new WebGL2Backend(gl, null)
    backend.programs.set('prog', { handle: {} })
    backend.textures.set('t1', { handle: {}, width: 8, height: 8 })
    // Arm the error check through the public frame entry point
    backend.glErrorCheckFrames = 1
    backend.beginFrame()

    const errors = []
    const originalError = console.error
    console.error = (...args) => errors.push(args.map(String).join(' '))
    try {
        backend.executePass({ id: 'p3', program: 'prog', outputs: { color: 't1' }, effectKey: 'synth/noise' }, {})

        assert.equal(errors.filter(m => m.includes('WebGL Error 1284 in pass p3')).length, 1,
            'the legacy per-pass console error is unchanged')
        assert.equal(backend.diagnostics.records.length, 2,
            'the missing-FBO record and the post-draw GL error record')
        const record = backend.diagnostics.records[1]
        assert.equal(record.code, 'ERR_GL_ERROR')
        assert.equal(record.backend, 'webgl2')
        assert.equal(record.stage, 'render')
        assert.equal(record.pass, 'p3')
        assert.equal(record.effect, 'synth/noise')
        assert.equal(record.program, 'prog')
        assert.equal(record.output, 't1')
        assert.equal(record.error, 1284)
    } finally {
        console.error = originalError
    }
})

test('WebGPU uncapturederror device validation records a structured diagnostic', () => {
    const device = createStubGPUDevice()
    const backend = new WebGPUBackend(device, {
        configuration: { device },
        getConfiguration() { return this.configuration }
    })

    const errors = []
    const originalError = console.error
    console.error = (...args) => errors.push(args.map(String).join(' '))
    try {
        assert.ok(device.listeners['uncapturederror'], 'the uncapturederror listener stays registered')
        device.listeners['uncapturederror']({ error: { message: 'Validation failed: bind group mismatch' } })

        assert.equal(errors.length, 1, 'the legacy console message is unchanged')
        assert.equal(errors[0], 'WebGPU uncaptured error: Validation failed: bind group mismatch')
        assert.equal(backend.diagnostics.records.length, 1)
        const record = backend.diagnostics.records[0]
        assert.equal(record.code, 'ERR_DEVICE_VALIDATION')
        assert.equal(record.backend, 'webgpu')
        assert.equal(record.stage, 'device-validation')
        assert.equal(record.detail, 'Validation failed: bind group mismatch')
    } finally {
        console.error = originalError
    }
})

// ---------------------------------------------------------------------------

test('WebGPU missing render targets record the same structured diagnostic as WebGL2', () => {
    const device = createStubGPUDevice()
    const backend = new WebGPUBackend(device, {
        configuration: { device },
        getConfiguration() { return this.configuration }
    })
    const warnings = []
    const originalWarn = console.warn
    console.warn = message => warnings.push(String(message))
    try {
        // Render surface write texture missing: the storage fallback is used.
        backend.storageTextures = new Map([['outputStorage_1280x720', { view: 'fallback-view' }]])
        const state = { graph: { renderSurface: 'o0' }, writeSurfaces: {} }
        assert.equal(backend.getOutputStorageView(state), 'fallback-view', 'fallback behavior unchanged')
        backend.getOutputStorageView(state)

        // Buffer-copy output texture missing.
        backend.storageBuffers.set('output_buffer', { buffer: {} })
        backend.copyBufferToTexture({ writeSurfaces: {} }, 'nope')

        assert.equal(warnings.length, 3, 'the legacy console warnings still fire on every occurrence')
        assert.deepEqual(
            backend.diagnostics.records.map(r => [r.code, r.backend, r.stage, r.kind, r.output, r.pass]),
            [
                ['ERR_MISSING_RENDER_TARGET', 'webgpu', 'render', 'storage-surface', 'o0', null],
                ['ERR_MISSING_RENDER_TARGET', 'webgpu', 'render', 'copy-output', 'nope', null],
            ],
            'one deduplicated record per missing target'
        )
    } finally {
        console.warn = originalWarn
    }
})

test('structured diagnostics serialize their legacy fields', () => {
    const diagnostic = new ShaderDiagnostic({
        code: 'ERR_SHADER_COMPILE',
        backend: 'webgl2',
        stage: 'compile',
        detail: 'boom',
        messages: []
    })
    const json = JSON.parse(JSON.stringify(diagnostic))
    assert.equal(json.code, 'ERR_SHADER_COMPILE')
    assert.equal(json.detail, 'boom')
    assert.equal(json.backend, 'webgl2')
    assert.equal(json.stage, 'compile')
})
