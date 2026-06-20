import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'
import { faceBasisMat3, CUBE_FACE_BASES } from '../src/renderer/cubeCamera.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })
async function runTests() {
    for (const { name, fn } of tests) {
        try { await fn(); console.log(`PASS: ${name}`) }
        catch (e) { console.error(`FAIL: ${name}`); console.error(e); process.exit(1) }
    }
    console.log('All cube driver tests passed')
}

const SIZE = 2

class MockBackend extends Backend {
    constructor() {
        super(null)
        this.basesSeen = []
        this.faceIndex = 0
    }

    async init() {}

    createTexture(id, spec) {
        this.textures.set(id, { handle: id, width: spec.width, height: spec.height, format: spec.format })
        return this.textures.get(id)
    }

    destroyTexture(id) { this.textures.delete(id) }

    async compileProgram(id, spec) {
        this.programs.set(id, { handle: id, type: spec.type || 'render' })
        return this.programs.get(id)
    }

    executePass(pass, state) {
        const b = state.globalUniforms && state.globalUniforms.cubeBasis
        if (b) this.basesSeen.push(Array.from(b))
    }

    beginFrame() { this.faceIndex++ }
    endFrame() {}
    resize() {}

    readPixels(id) {
        const n = SIZE * SIZE * 4
        const data = new Uint8Array(n)
        data[0] = this.basesSeen.length
        data[3] = 255
        return { width: SIZE, height: SIZE, data }
    }

    getName() { return 'Mock' }
    static isAvailable() { return true }
}

test('CUBE_FACE_BASES is precomputed and matches faceBasisMat3', () => {
    if (!CUBE_FACE_BASES || CUBE_FACE_BASES.length !== 6) {
        throw new Error(`Expected CUBE_FACE_BASES to be array of 6, got ${CUBE_FACE_BASES?.length}`)
    }
    for (let f = 0; f < 6; f++) {
        const want = faceBasisMat3(f)
        const got = CUBE_FACE_BASES[f]
        for (let i = 0; i < 9; i++) {
            if (Math.abs(got[i] - want[i]) > 1e-9) {
                throw new Error(`CUBE_FACE_BASES[${f}][${i}] ${got[i]} != ${want[i]}`)
            }
        }
    }
})

test('renderCubemap renders 6 faces with the 6 distinct bases', async () => {
    const backend = new MockBackend()
    const graph = {
        passes: [{ id: 'p0', program: 'renderCube' }],
        textures: new Map(),
        programs: { renderCube: { fragment: 'void main() {}' } },
        renderSurface: 'o0'
    }
    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(SIZE, SIZE)

    const faces = await pipeline.renderCubemap({ size: SIZE, mode: 'volumetric', outputSurface: 'o0' })

    if (faces.length !== 6) throw new Error(`expected 6 faces, got ${faces.length}`)

    for (let f = 0; f < 6; f++) {
        if (!faces[f] || !faces[f].data) throw new Error(`face ${f} has no data`)
        if (faces[f].data.length !== SIZE * SIZE * 4) {
            throw new Error(`face ${f} data length ${faces[f].data.length} != ${SIZE * SIZE * 4}`)
        }
    }

    if (backend.basesSeen.length !== 6) {
        throw new Error(`expected 6 cubeBasis captures, got ${backend.basesSeen.length}`)
    }

    for (let f = 0; f < 6; f++) {
        const want = faceBasisMat3(f)
        const got = backend.basesSeen[f]
        for (let i = 0; i < 9; i++) {
            if (Math.abs(got[i] - want[i]) > 1e-9) {
                throw new Error(`face ${f} basis[${i}] got ${got[i]} != want ${want[i]}`)
            }
        }
    }
})

runTests()
