import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { registerOp } from '../src/lang/ops.js'
import { registerEffect } from '../src/runtime/registry.js'
import { expand } from '../src/runtime/expander.js'

registerOp('basics.osc', {
    name: 'osc',
    args: [{ name: 'freq', type: 'float', default: 60 }]
})
registerOp('basics.blend', {
    name: 'blend',
    args: [{ name: 'tex', type: 'surface' }]
})
registerStarterOps(['basics.osc'])

registerEffect('basics.osc', {
    name: 'osc',
    passes: [
        {
            type: 'render',
            program: 'osc',
            outputs: { color: 'outputTex' }
        }
    ]
})
registerEffect('basics.blend', {
    name: 'blend',
    passes: [{
        type: 'render',
        program: 'blend',
        inputs: {
            src: 'inputColor',
            tex: 'tex'
        },
        outputs: { color: 'outputTex' }
    }]
})

function compile(code) {
    const tokens = lex(code)
    const ast = parse(tokens)
    return validate(ast)
}

function test(name, code, check) {
    try {
        console.log(`Running test: ${name}`)
        const result = compile(code)
        if (result.diagnostics.length > 0) {
            throw new Error(`Compilation failed: ${JSON.stringify(result.diagnostics)}`)
        }
        const expanded = expand(result)
        check(expanded)
        console.log(`PASS: ${name}`)
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e)
    }
}

test('Expand Simple Chain', 'search basics\nosc(10).write(o0)', (result) => {
    if (result.errors.length > 0) throw new Error(result.errors[0].message)
    if (result.passes.length !== 1) throw new Error(`Expected 1 pass, got ${result.passes.length}`)
    const pass = result.passes[0]
    if (pass.program !== 'osc') throw new Error('Expected osc program')
    if (pass.outputs.color !== 'global_o0') throw new Error(`Expected output global_o0, got ${pass.outputs.color}`)
})

test('Expand Blend Chain', 'search basics\nosc(10).blend(read(o0)).write(o1)', (result) => {
    if (result.errors.length > 0) throw new Error(result.errors[0].message)
    // osc -> blend
    // osc is node_0. blend is node_1.
    // osc pass: outputs node_0_out
    // blend pass: inputs src=node_0_out, tex=global_o0

    if (result.passes.length !== 2) throw new Error(`Expected 2 passes, got ${result.passes.length}`)

    const oscPass = result.passes[0]
    if (oscPass.program !== 'osc') throw new Error('Expected osc first')

    const blendPass = result.passes[1]
    if (blendPass.program !== 'blend') throw new Error('Expected blend second')
    if (blendPass.inputs.src !== 'node_0_out') throw new Error(`Expected src=node_0_out, got ${blendPass.inputs.src}`)
    if (blendPass.inputs.tex !== 'global_o0') throw new Error(`Expected tex=global_o0, got ${blendPass.inputs.tex}`)
})
