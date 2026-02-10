/**
 * Basic Pipeline Tests
 * Tests the pipeline executor with mock backends
 */

import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'

const tests = []

function test(name, fn) {
    tests.push({ name, fn })
}

async function runTests() {
    console.log('\n=== Running Pipeline Tests ===\n')
    for (const { name, fn } of tests) {
        try {
            console.log(`Running test: ${name}`)
            await fn()
            console.log(`PASS: ${name}`)
        } catch (e) {
            console.error(`FAIL: ${name}`)
            console.error(e)
            process.exit(1)
        }
    }
}

// Mock backend for testing
class MockBackend extends Backend {
    constructor() {
        super(null)
        this.initCalled = false
        this.passes = []
        this.frameCount = 0
    }

    async init() {
        this.initCalled = true
    }

    createTexture(id, spec) {
        this.textures.set(id, {
            handle: `mock_texture_${id}`,
            width: spec.width,
            height: spec.height,
            format: spec.format
        })
        return this.textures.get(id)
    }

    destroyTexture(id) {
        this.textures.delete(id)
    }

    async compileProgram(id, spec) {
        this.programs.set(id, {
            handle: `mock_program_${id}`,
            type: spec.type || 'render'
        })
        return this.programs.get(id)
    }

    executePass(pass, state) {
        this.passes.push({
            passId: pass.id,
            program: pass.program,
            frameIndex: state.frameIndex
        })
    }

    beginFrame() {
        this.frameCount++
    }

    endFrame() {
        // no-op
    }

    resize() {
        // no-op
    }

    getName() {
        return 'Mock'
    }

    static isAvailable() {
        return true
    }
}

test('Pipeline - Initialization', async () => {
    const backend = new MockBackend()
    const graph = {
        passes: [],
        textures: new Map()
    }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(800, 600)

    if (!backend.initCalled) {
        throw new Error('Backend init not called')
    }

    if (pipeline.width !== 800 || pipeline.height !== 600) {
        throw new Error('Pipeline dimensions not set correctly')
    }

    // Check that surfaces were created (o0-o7 + geo0-geo7 + vol0-vol7 + mesh0-mesh7 = 32)
    if (pipeline.surfaces.size !== 32) {
        throw new Error(`Expected 32 surfaces, got ${pipeline.surfaces.size}`)
    }

    const o0 = pipeline.surfaces.get('o0')
    if (!o0 || !o0.read || !o0.write) {
        throw new Error('Surface o0 not created correctly')
    }
})

test('Pipeline - Frame Execution', async () => {
    const backend = new MockBackend()
    const graph = {
        passes: [
            {
                id: 'pass_0',
                program: 'test_program',
                inputs: {},
                outputs: { color: 'tex_0' }
            }
        ],
        textures: new Map([
            ['tex_0', { width: 800, height: 600, format: 'rgba8' }]
        ]),
        programs: {
            'test_program': { fragment: 'void main() {}' }
        }
    }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(800, 600)

    // Render a frame
    pipeline.render(0.016)

    if (backend.frameCount !== 1) {
        throw new Error('Frame not executed')
    }

    if (backend.passes.length !== 1) {
        throw new Error('Pass not executed')
    }

    if (backend.passes[0].passId !== 'pass_0') {
        throw new Error('Wrong pass executed')
    }
})

test('Pipeline - Global Uniforms', async () => {
    const backend = new MockBackend()
    const graph = { passes: [], textures: new Map() }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(800, 600)

    pipeline.render(1.5)

    const uniforms = pipeline.globalUniforms

    if (uniforms.time !== 1.5) {
        throw new Error(`Expected time=1.5, got ${uniforms.time}`)
    }

    if (uniforms.frame !== 0) {
        throw new Error(`Expected frame=0, got ${uniforms.frame}`)
    }

    if (!uniforms.resolution || uniforms.resolution[0] !== 800) {
        throw new Error('Resolution uniform not set correctly')
    }
})

test('Pipeline - Dimension Resolution', async () => {
    const backend = new MockBackend()
    const graph = { passes: [], textures: new Map() }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(1000, 800)

    // Test different dimension specs
    const testCases = [
        { spec: 100, expected: 100 },
        { spec: 'screen', expected: 1000 },
        { spec: '50%', expected: 500 },
        { spec: '25%', expected: 250 },
        { spec: { scale: 0.5 }, expected: 500 },
        { spec: { scale: 2.0 }, expected: 2000 },
        { spec: { scale: 0.1, clamp: { min: 200, max: 400 } }, expected: 200 }
    ]

    for (const tc of testCases) {
        const result = pipeline.resolveDimension(tc.spec, 1000)
        if (result !== tc.expected) {
            throw new Error(`Dimension ${JSON.stringify(tc.spec)}: expected ${tc.expected}, got ${result}`)
        }
    }
})

test('Pipeline - Surface Double Buffering', async () => {
    const backend = new MockBackend()
    const graph = { passes: [], textures: new Map(), renderSurface: 'o0' }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(800, 600)

    const o0 = pipeline.surfaces.get('o0')
    const initialRead = o0.read
    const initialWrite = o0.write

    // Render a frame - should swap buffers
    pipeline.render(0)

    const afterRead = o0.read
    const afterWrite = o0.write

    if (afterRead !== initialWrite) {
        throw new Error('Read buffer not swapped correctly')
    }

    if (afterWrite !== initialRead) {
        throw new Error('Write buffer not swapped correctly')
    }
})

test('Pipeline - Pass Condition Skip', async () => {
    const backend = new MockBackend()
    const graph = {
        passes: [
            {
                id: 'pass_0',
                program: 'always_run',
                inputs: {},
                outputs: { color: 'tex_0' }
            },
            {
                id: 'pass_1',
                program: 'conditional',
                inputs: {},
                outputs: { color: 'tex_1' },
                conditions: {
                    skipIf: [{ uniform: 'frame', equals: 0 }]
                }
            }
        ],
        textures: new Map(),
        programs: {
            'always_run': { fragment: 'void main() {}' },
            'conditional': { fragment: 'void main() {}' }
        }
    }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(800, 600)

    // First frame - pass_1 should be skipped
    pipeline.render(0)

    if (backend.passes.length !== 1) {
        throw new Error(`Expected 1 pass executed, got ${backend.passes.length}`)
    }

    if (backend.passes[0].passId !== 'pass_0') {
        throw new Error('Wrong pass executed in first frame')
    }

    // Second frame - both passes should run
    backend.passes = []
    pipeline.render(0.016)

    if (backend.passes.length !== 2) {
        throw new Error(`Expected 2 passes executed in second frame, got ${backend.passes.length}`)
    }
})

test('Pipeline - Render Surface Selection', async () => {
    // Test that graph.renderSurface determines which surface is presented

    // Track which surface was presented
    let presentedTextureId = null

    class RenderSurfaceBackend extends MockBackend {
        present(textureId) {
            presentedTextureId = textureId
        }
    }

    const backend = new RenderSurfaceBackend()

    // Create a graph that specifies o2 as the render surface
    const graph = {
        passes: [],
        textures: new Map(),
        renderSurface: 'o2'  // Explicitly render o2 instead of default o0
    }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(400, 300)

    // Verify o2 surface exists
    const o2 = pipeline.surfaces.get('o2')
    if (!o2) {
        throw new Error('o2 surface should exist')
    }

    // Capture the expected texture ID before render (render swaps buffers after presenting)
    const expectedTextureId = o2.read

    // Render a frame
    pipeline.render(0)

    // Verify o2 was presented (from the read texture before the swap)
    if (presentedTextureId !== expectedTextureId) {
        throw new Error(`Expected o2's read texture (${expectedTextureId}) to be presented, got ${presentedTextureId}`)
    }
})

test('Pipeline - No Render Surface Skips Present', async () => {
    // Without explicit renderSurface, present() should not be called
    // but swapBuffers and frameIndex should still advance

    let presentCalled = false

    class NoPresentBackend extends MockBackend {
        present() {
            presentCalled = true
        }
    }

    const backend = new NoPresentBackend()
    const graph = { passes: [], textures: new Map() }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(400, 300)

    const o0 = pipeline.surfaces.get('o0')
    const initialRead = o0.read
    const initialWrite = o0.write

    pipeline.render(0)

    if (presentCalled) {
        throw new Error('present() should not be called without renderSurface')
    }

    // Buffers should still swap
    if (o0.read !== initialWrite || o0.write !== initialRead) {
        throw new Error('Buffers should swap even without renderSurface')
    }
})

runTests()
