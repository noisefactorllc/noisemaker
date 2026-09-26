/**
 * Regression tests for the unified backend diagnostic union (GAP-007).
 *
 * The register row: "Backend shader/compiler failures are not normalized to
 * one structured diagnostic union — backend retry logic must parse
 * browser/compiler strings."
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

// ---------------------------------------------------------------------------
// WebGL2 stub GL context (Proxy-based, per the gl-error-gating test pattern)
// ---------------------------------------------------------------------------

function createStubGL({ shaderLog = '', linkLog = '', fragmentCompileOk = true, linkOk = true } = {}) {
    const cache = new Map()
    let nextConst = 1

    const gl = new Proxy({}, {
        get(_target, prop) {
            if (cache.has(prop)) return cache.get(prop)

            let value
            if (prop === 'NO_ERROR') {
                value = 0
            } else if (prop === 'getError') {
                value = () => 0
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
                value = (_program, pname) => (pname === gl.LINK_STATUS ? linkOk : 0)
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
