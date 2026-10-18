import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { registerOp } from '../src/lang/ops.js'
import { registerEffect } from '../src/runtime/registry.js'
import { expand } from '../src/runtime/expander.js'

registerOp('synth.osc', {
    name: 'osc',
    args: [{ name: 'freq', type: 'float', default: 60 }]
})
registerOp('filter.blend', {
    name: 'blend',
    args: [{ name: 'tex', type: 'surface' }]
})
registerStarterOps(['synth.osc'])

registerEffect('synth.osc', {
    name: 'osc',
    passes: [
        {
            type: 'render',
            program: 'osc',
            outputs: { color: 'outputTex' }
        }
    ]
})
registerEffect('filter.blend', {
    name: 'blend',
    passes: [{
        type: 'render',
        program: 'blend',
        inputs: {
            src: 'inputTex',
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
        process.exitCode = 1
    }
}

test('Expand Simple Chain', 'search synth, filter\nosc(10).write(o0)', (result) => {
    if (result.errors.length > 0) throw new Error(result.errors[0].message)
    // osc renders to its node texture; write(o0) adds a blit pass into global_o0.
    if (result.passes.length !== 2) throw new Error(`Expected 2 passes, got ${result.passes.length}`)
    const pass = result.passes[0]
    if (pass.program !== 'node_0_osc') throw new Error(`Expected node_0_osc program, got ${pass.program}`)
    if (pass.outputs.color !== 'node_0_out') throw new Error(`Expected output node_0_out, got ${pass.outputs.color}`)
    const blit = result.passes[1]
    if (blit.program !== 'blit') throw new Error(`Expected blit program, got ${blit.program}`)
    if (blit.inputs.src !== 'node_0_out') throw new Error(`Expected blit src=node_0_out, got ${blit.inputs.src}`)
    if (blit.outputs.color !== 'global_o0') throw new Error(`Expected blit output global_o0, got ${blit.outputs.color}`)
})

test('Expand Blend Chain', 'search synth, filter\nosc(10).blend(read(o0)).write(o1)', (result) => {
    if (result.errors.length > 0) throw new Error(result.errors[0].message)
    // osc -> blend -> write(o1)
    // osc is node_0. blend is node_1. The write blit is node_2.
    // osc pass: outputs node_0_out
    // blend pass: inputs src=node_0_out, tex=global_o0; outputs node_1_out
    // blit pass: inputs src=node_1_out; outputs global_o1

    if (result.passes.length !== 3) throw new Error(`Expected 3 passes, got ${result.passes.length}`)

    const oscPass = result.passes[0]
    if (oscPass.program !== 'node_0_osc') throw new Error(`Expected node_0_osc first, got ${oscPass.program}`)

    const blendPass = result.passes[1]
    if (blendPass.program !== 'node_1_blend') throw new Error(`Expected node_1_blend second, got ${blendPass.program}`)
    if (blendPass.inputs.src !== 'node_0_out') throw new Error(`Expected src=node_0_out, got ${blendPass.inputs.src}`)
    if (blendPass.inputs.tex !== 'global_o0') throw new Error(`Expected tex=global_o0, got ${blendPass.inputs.tex}`)

    const blit = result.passes[2]
    if (blit.program !== 'blit') throw new Error(`Expected blit third, got ${blit.program}`)
    if (blit.inputs.src !== 'node_1_out') throw new Error(`Expected blit src=node_1_out, got ${blit.inputs.src}`)
    if (blit.outputs.color !== 'global_o1') throw new Error(`Expected blit output global_o1, got ${blit.outputs.color}`)
})
