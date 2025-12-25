import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'

function test(name, code, check, expectError = null) {
    try {
        console.log(`Running test: ${name}`)
        const tokens = lex(code)
        const ast = parse(tokens)
        if (expectError) {
            console.error(`FAIL: ${name}`)
            console.error('Expected error but parsing succeeded')
            return
        }
        check(ast)
        console.log(`PASS: ${name}`)
    } catch (e) {
        if (expectError) {
            // Test expects an error - validate it
            try {
                expectError(e)
                // expectError should have printed pass if successful
            } catch (validationError) {
                console.error(`FAIL: ${name}`)
                console.error(validationError)
            }
            return
        }
        console.error(`FAIL: ${name}`)
        console.error(e)
        try {
            const tokens = lex(code)
            const ast = parse(tokens)
            console.log("AST:", JSON.stringify(ast, null, 2))
        } catch {
            console.log("Could not print AST due to parse error")
        }
    }
}

test('Simple Chain', 'search synth\nnoise(10).write(o0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    // Chain now includes both the Call and the Write node (write is chainable)
    if (plan.chain.length !== 2) throw new Error('Expected 2 elements in chain (Call + Write)')
    if (plan.chain[0].name !== 'noise') throw new Error('Expected noise')
    if (plan.chain[1].type !== 'Write') throw new Error('Expected Write node')
    if (plan.write.name !== 'o0') throw new Error('Expected write o0')
})

test('Variable Assignment', 'search synth\nlet x = noise(10)', (ast) => {
    if (ast.vars.length !== 1) throw new Error('Expected 1 var')
    const v = ast.vars[0]
    if (v.name !== 'x') throw new Error('Expected var x')
    // Single call chain is unwrapped to Call node
    if (v.expr.type !== 'Call') throw new Error('Expected Call type')
    if (v.expr.name !== 'noise') throw new Error('Expected noise')
})

test('Arrow Function', 'search synth\nlet f = () => noise(10)', (ast) => {
    const v = ast.vars[0]
    if (v.expr.type !== 'Func') throw new Error('Expected Func type')
    if (v.expr.src !== 'noise(10)') throw new Error('Expected src noise(10)')
})

test('Search Directive - Single Namespace', 'search synth\nnoise(10).write(o0)', (ast) => {
    if (!ast.namespace) throw new Error('Expected namespace metadata')
    if (!ast.namespace.searchOrder) throw new Error('Expected searchOrder')
    if (ast.namespace.searchOrder.length !== 1) throw new Error('Expected 1 namespace in searchOrder')
    if (ast.namespace.searchOrder[0] !== 'synth') throw new Error('Expected synth in searchOrder')
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
})

test('Search Directive - Multiple Namespaces', 'search synth, filter, mixer\nnoise(10).write(o0)', (ast) => {
    if (!ast.namespace) throw new Error('Expected namespace metadata')
    if (!ast.namespace.searchOrder) throw new Error('Expected searchOrder')
    if (ast.namespace.searchOrder.length !== 3) throw new Error('Expected 3 namespaces in searchOrder')
    if (ast.namespace.searchOrder[0] !== 'synth') throw new Error('Expected synth first')
    if (ast.namespace.searchOrder[1] !== 'filter') throw new Error('Expected filter second')
    if (ast.namespace.searchOrder[2] !== 'mixer') throw new Error('Expected mixer third')
})

test('Missing Search Directive - Should Error', 'noise(10).write(o0)', () => {
    throw new Error('Should have thrown SyntaxError for missing search directive')
}, (e) => {
    // This test expects an error
    if (!(e instanceof SyntaxError)) throw new Error('Expected SyntaxError')
    if (!e.message.includes("Missing required 'search' directive")) throw new Error('Expected missing search directive error message')
    console.log('PASS: Missing Search Directive - Should Error (correctly caught)')
    return true
})

test('Inline Namespace - Should Error', 'search synth\nsynth.noise(10).write(o0)', () => {
    throw new Error('Should have thrown SyntaxError for inline namespace')
}, (e) => {
    // This test expects an error
    if (!(e instanceof SyntaxError)) throw new Error('Expected SyntaxError')
    if (!e.message.includes('Inline namespace syntax')) throw new Error('Expected inline namespace error message')
    console.log('PASS: Inline Namespace - Should Error (correctly caught)')
    return true
})

test('read() creates Read node', 'search synth\nread(o0).write(o1)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    // Chain now includes both the Read and the Write node (write is chainable)
    if (plan.chain.length !== 2) throw new Error('Expected 2 elements in chain (Read + Write)')
    // read() creates a Read node (pipeline built-in)
    if (plan.chain[0].type !== 'Read') throw new Error('Expected Read node type')
    if (plan.chain[0].surface.name !== 'o0') throw new Error('Expected surface o0')
    if (plan.chain[1].type !== 'Write') throw new Error('Expected Write node')
    if (plan.write.name !== 'o1') throw new Error('Expected write o1')
})

test('write3d parses correctly', 'search synth\nnoise(10).write3d(vol0, geo0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    // Chain includes Call + Write3D node
    if (plan.chain.length !== 2) throw new Error('Expected 2 elements in chain (Call + Write3D)')
    if (!plan.write3d) throw new Error('Expected write3d')
    if (plan.write3d.tex3d.name !== 'vol0') throw new Error('Expected tex3d vol0')
    if (plan.write3d.geo.name !== 'geo0') throw new Error('Expected geo geo0')
})

// ============ Comment Preservation Tests ============

test('Line comment before statement is captured', 'search synth\n// this is a comment\nnoise(10).write(o0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    if (!plan.leadingComments) throw new Error('Expected leadingComments on plan')
    if (plan.leadingComments.length !== 1) throw new Error('Expected 1 leading comment')
    if (!plan.leadingComments[0].includes('this is a comment')) throw new Error('Expected comment text')
})

test('Multiple line comments before statement', 'search synth\n// first comment\n// second comment\nnoise(10).write(o0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    if (!plan.leadingComments) throw new Error('Expected leadingComments on plan')
    if (plan.leadingComments.length !== 2) throw new Error('Expected 2 leading comments')
    if (!plan.leadingComments[0].includes('first')) throw new Error('Expected first comment')
    if (!plan.leadingComments[1].includes('second')) throw new Error('Expected second comment')
})

test('Comment before chained method', 'search synth\nnoise(10)\n  // comment on bloom\n  .bloom().write(o0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const chain = ast.plans[0].chain
    if (chain.length !== 3) throw new Error('Expected 3 elements in chain (noise, bloom, Write)')
    // bloom should have the leading comment
    const bloom = chain[1]
    if (!bloom.leadingComments) throw new Error('Expected leadingComments on bloom')
    if (!bloom.leadingComments[0].includes('comment on bloom')) throw new Error('Expected comment text on bloom')
})

test('Block comment is captured', 'search synth\n/* block comment */\nnoise(10).write(o0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    if (!plan.leadingComments) throw new Error('Expected leadingComments on plan')
    if (!plan.leadingComments[0].includes('block comment')) throw new Error('Expected block comment text')
})

test('Trailing comments at end of program', 'search synth\nnoise(10).write(o0)\n// trailing comment', (ast) => {
    if (!ast.trailingComments) throw new Error('Expected trailingComments on program')
    if (ast.trailingComments.length !== 1) throw new Error('Expected 1 trailing comment')
    if (!ast.trailingComments[0].includes('trailing')) throw new Error('Expected trailing comment text')
})

test('Comment with subchain marker', 'search synth\n// @subchain:begin name="feedback"\nnoise(10)\n  .bloom()\n  // @subchain:end\n  .write(o0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    // Plan should have the @subchain:begin comment
    if (!plan.leadingComments) throw new Error('Expected leadingComments on plan')
    if (!plan.leadingComments[0].includes('@subchain:begin')) throw new Error('Expected @subchain:begin marker')
    // Write should have the @subchain:end comment
    const chain = plan.chain
    const writeNode = chain[chain.length - 1]
    if (!writeNode.leadingComments) throw new Error('Expected leadingComments on write')
    if (!writeNode.leadingComments[0].includes('@subchain:end')) throw new Error('Expected @subchain:end marker')
})
