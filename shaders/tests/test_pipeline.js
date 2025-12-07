/**
 * Basic Pipeline Tests
 * Tests the pipeline executor with mock backends
 */

import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

async function runTests() {
    console.log('\n=== Running Pipeline Tests ===\n');
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
    
    // Check that surfaces were created
    if (pipeline.surfaces.size !== 8) {
        throw new Error(`Expected 8 surfaces, got ${pipeline.surfaces.size}`)
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
    const graph = { passes: [], textures: new Map() }
    
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

test('Pipeline - Feedback Surfaces', async () => {
    const backend = new MockBackend()
    
    // Add copyTexture to mock backend
    backend.copyTexture = function(srcId, dstId) {
        this.copies = this.copies || []
        this.copies.push({ src: srcId, dst: dstId })
    }
    
    const graph = { passes: [], textures: new Map() }
    
    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(800, 600)
    
    // Check that feedback surfaces were created
    if (pipeline.feedbackSurfaces.size !== 4) {
        throw new Error(`Expected 4 feedback surfaces, got ${pipeline.feedbackSurfaces.size}`)
    }
    
    const f0 = pipeline.feedbackSurfaces.get('f0')
    if (!f0 || !f0.read || !f0.write) {
        throw new Error('Feedback surface f0 not created correctly')
    }
    
    // Initially not dirty
    if (f0.dirty) {
        throw new Error('Feedback surface should not be dirty initially')
    }
    
    // Mark feedback surface as written
    pipeline.markFeedbackDirty('f0')
    
    if (!f0.dirty) {
        throw new Error('Feedback surface should be dirty after markFeedbackDirty')
    }
    
    // Render a frame - should blit dirty feedback surfaces
    backend.copies = []
    pipeline.render(0)
    
    // Check that blit happened (write -> read)
    if (backend.copies.length !== 1) {
        throw new Error(`Expected 1 copy operation, got ${backend.copies.length}`)
    }
    
    if (backend.copies[0].src !== f0.write || backend.copies[0].dst !== f0.read) {
        throw new Error('Feedback blit did not copy write to read')
    }
    
    // After frame, dirty should be cleared
    if (f0.dirty) {
        throw new Error('Feedback surface should not be dirty after frame')
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

test('Pipeline - Default Render Surface', async () => {
    // Test that without explicit renderSurface, o0 is used
    
    let presentedTextureId = null
    
    class DefaultRenderBackend extends MockBackend {
        present(textureId) {
            presentedTextureId = textureId
        }
    }
    
    const backend = new DefaultRenderBackend()
    
    // Create a graph without renderSurface specified
    const graph = {
        passes: [],
        textures: new Map()
        // No renderSurface - should default to o0
    }
    
    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(400, 300)
    
    const o0 = pipeline.surfaces.get('o0')
    
    // Capture expected texture ID before render
    const expectedTextureId = o0.read
    
    pipeline.render(0)
    
    // Should present o0 by default
    if (presentedTextureId !== expectedTextureId) {
        throw new Error(`Expected o0's read texture (${expectedTextureId}) to be presented, got ${presentedTextureId}`)
    }
})

runTests();
