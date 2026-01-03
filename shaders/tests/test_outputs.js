import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'
import { parse, lex } from '../src/lang/index.js'

function test(name, fn) {
    try {
        console.log(`Running test: ${name}`)
        fn()
        console.log(`PASS: ${name}`)
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e)
        process.exit(1)
    }
}

// Mock backend for testing
class MockBackend extends Backend {
    constructor() {
        super(null)
    }

    async init() {}

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

    resize() {}
}

test('Verify 8 Outputs', async () => {
    const backend = new MockBackend()
    const pipeline = new Pipeline(null, backend)

    await pipeline.init()

    const expectedOutputs = ['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7']

    for (const name of expectedOutputs) {
        const surface = pipeline.surfaces.get(name)
        if (!surface) {
            throw new Error(`Surface ${name} was not created`)
        }
        if (!surface.read || !surface.write) {
            throw new Error(`Surface ${name} is missing read/write buffers`)
        }
    }

    // Verify no extra outputs (optional, but good for sanity)
    // Note: surfaces map might contain other things if the implementation changes,
    // but currently it only holds global surfaces.
    // Let's just check that we have at least these 8.
})

test('Parse o7 Output', () => {
    const code = 'search synth\nnoise().write(o7)'
    const tokens = lex(code)
    const ast = parse(tokens)

    // AST structure: { plans: [ { chain: [...], write: { type: 'OutputRef', name: 'o7' } } ] }
    const plan = ast.plans[0]
    if (plan.write.name !== 'o7') {
        throw new Error(`Expected output name o7, got ${plan.write.name}`)
    }
    console.log('Successfully parsed .write(o7)')
})
