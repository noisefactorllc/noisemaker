import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { registerOp } from '../src/lang/ops.js'

registerOp('basics.noise', {
    name: 'noise',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'seed', type: 'float', default: 1 }
    ]
})

registerOp('basics.kaleid', {
    name: 'kaleid',
    args: [
        { name: 'nSides', type: 'float', default: 4 }
    ]
})

registerOp('basics.bloom', {
    name: 'bloom',
    args: [
        { name: 'intensity', type: 'float', default: 0.5 }
    ]
})

registerStarterOps(['basics.noise'])

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

test('Valid Chain', 'search basics\nnoise(10).write(o0)', (result) => {
    if (result.diagnostics.length > 0) {
        throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
    }
    if (result.plans.length !== 1) throw new Error('Expected 1 plan')
})

test('Unknown Function', 'search basics\nunknown(10).write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S001')
    if (!diag) throw new Error('Expected S001 (Unknown identifier)')
    // Verify the identifier name is included in the message
    if (!diag.identifier) throw new Error('Expected identifier field in diagnostic')
    if (diag.identifier !== 'unknown') throw new Error(`Expected identifier 'unknown', got '${diag.identifier}'`)
    if (!diag.message.includes('unknown')) throw new Error('Expected identifier name in message')
})

test('Missing Write', 'search basics\nnoise(10)', (result) => {
    // S001 is the generic error for missing write(), S006 is more specific for starter chains
    // Without the effect registry loaded, we get S001
    const diag = result.diagnostics.find(d => d.code === 'S006' || d.code === 'S001')
    if (!diag) throw new Error('Expected S006 or S001 (Chain missing write)')
})

test('Argument Type Mismatch', 'search basics\nnoise("string").write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S002') // Or ERR_ARG_TYPE
    if (!diag) throw new Error('Expected S002 (Argument out of range/type mismatch)')
})

test('Illegal Chain Structure', 'search basics\nbloom(0.5).write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S005')
    if (!diag) throw new Error('Expected S005 (Illegal chain structure)')
})
