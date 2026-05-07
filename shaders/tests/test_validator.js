import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { registerOp } from '../src/lang/ops.js'

registerOp('synth.noise', {
    name: 'noise',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'seed', type: 'float', default: 1 }
    ]
})

registerOp('filter.kaleid', {
    name: 'kaleid',
    args: [
        { name: 'nSides', type: 'float', default: 4 }
    ]
})

registerOp('filter.bloom', {
    name: 'bloom',
    args: [
        { name: 'intensity', type: 'float', default: 0.5 }
    ]
})

registerStarterOps(['synth.noise'])

function test(name, code, check) {
    try {
        console.log(`Running test: ${name}`)
        const tokens = lex(code)
        const ast = parse(tokens)
        const result = validate(ast)
        check(result)
        console.log(`PASS: ${name}`)
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e)
    }
}

test('Valid Chain', 'search synth, filter\nnoise(10).write(o0)', (result) => {
    if (result.diagnostics.length > 0) {
        throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
    }
    if (result.plans.length !== 1) throw new Error('Expected 1 plan')
})

test('Unknown Function', 'search synth, filter\nunknown(10).write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S001')
    if (!diag) throw new Error('Expected S001 (Unknown identifier)')
    // Verify the identifier name is included in the message
    if (!diag.identifier) throw new Error('Expected identifier field in diagnostic')
    if (diag.identifier !== 'unknown') throw new Error(`Expected identifier 'unknown', got '${diag.identifier}'`)
    if (!diag.message.includes('unknown')) throw new Error('Expected identifier name in message')
})

test('Missing Write', 'search synth, filter\nnoise(10)', (result) => {
    // S001 is the generic error for missing write(), S006 is more specific for starter chains
    // Without the effect registry loaded, we get S001
    const diag = result.diagnostics.find(d => d.code === 'S006' || d.code === 'S001')
    if (!diag) throw new Error('Expected S006 or S001 (Chain missing write)')
})

test('Argument Type Mismatch', 'search synth, filter\nnoise("string").write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S002') // Or ERR_ARG_TYPE
    if (!diag) throw new Error('Expected S002 (Argument out of range/type mismatch)')
})

test('Illegal Chain Structure', 'search synth, filter\nbloom(0.5).write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S005')
    if (!diag) throw new Error('Expected S005 (Illegal chain structure)')
})

// Register an op with vec2/vec3/vec4 globals for the array-literal tests.
registerOp('synth.vecop', {
    name: 'vecop',
    args: [
        { name: 'pos2', type: 'vec2', default: [0, 0] },
        { name: 'pos3', type: 'vec3', default: [0, 0, 0] },
        { name: 'pos4', type: 'vec4', default: [0, 0, 0, 1] }
    ]
})
registerStarterOps(['synth.vecop'])

test('ArrayLiteral — vec4 arg coerces to numeric array', 'search synth\nvecop(pos4: [0.05, 0.5, 0.95, 1.0]).write(o0)', (result) => {
    if (result.diagnostics.length > 0) throw new Error('No diagnostics expected: ' + JSON.stringify(result.diagnostics))
    const plan = result.plans[0]
    const args = plan.chain[0].args
    if (!Array.isArray(args.pos4)) throw new Error('Expected pos4 to be an array, got ' + JSON.stringify(args.pos4))
    if (args.pos4.length !== 4) throw new Error('Expected pos4 length 4')
    if (args.pos4[0] !== 0.05 || args.pos4[3] !== 1.0) throw new Error('Wrong values: ' + JSON.stringify(args.pos4))
})

test('ArrayLiteral — vec3 with negative values', 'search synth\nvecop(pos3: [-1, 2, -3.5]).write(o0)', (result) => {
    if (result.diagnostics.length > 0) throw new Error('Unexpected diagnostics: ' + JSON.stringify(result.diagnostics))
    const args = result.plans[0].chain[0].args
    if (args.pos3[0] !== -1 || args.pos3[1] !== 2 || args.pos3[2] !== -3.5) throw new Error('Wrong values: ' + JSON.stringify(args.pos3))
})

test('ArrayLiteral — wrong arity is rejected with S002', 'search synth\nvecop(pos3: [1, 2]).write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S002')
    if (!diag) throw new Error('Expected S002 for wrong-arity array literal, got ' + JSON.stringify(result.diagnostics))
})

test('ArrayLiteral — backward compat, vec3() Call still works', 'search synth\nvecop(pos3: vec3(0.1, 0.2, 0.3)).write(o0)', (result) => {
    if (result.diagnostics.length > 0) throw new Error('Unexpected diagnostics: ' + JSON.stringify(result.diagnostics))
    const args = result.plans[0].chain[0].args
    if (args.pos3.length !== 3 || args.pos3[1] !== 0.2) throw new Error('Wrong values: ' + JSON.stringify(args.pos3))
})
