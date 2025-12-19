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

test('Simple Chain', 'search basics\nnoise(10).write(o0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    // Chain now includes both the Call and the Write node (write is chainable)
    if (plan.chain.length !== 2) throw new Error('Expected 2 elements in chain (Call + Write)')
    if (plan.chain[0].name !== 'noise') throw new Error('Expected noise')
    if (plan.chain[1].type !== 'Write') throw new Error('Expected Write node')
    if (plan.write.name !== 'o0') throw new Error('Expected write o0')
})

test('Variable Assignment', 'search basics\nlet x = noise(10)', (ast) => {
    if (ast.vars.length !== 1) throw new Error('Expected 1 var')
    const v = ast.vars[0]
    if (v.name !== 'x') throw new Error('Expected var x')
    // Single call chain is unwrapped to Call node
    if (v.expr.type !== 'Call') throw new Error('Expected Call type')
    if (v.expr.name !== 'noise') throw new Error('Expected noise')
})

test('Arrow Function', 'search basics\nlet f = () => noise(10)', (ast) => {
    const v = ast.vars[0]
    if (v.expr.type !== 'Func') throw new Error('Expected Func type')
    if (v.expr.src !== 'noise(10)') throw new Error('Expected src noise(10)')
})

test('Arrow Function in Loop', `search basics
loop 5 {
  let f = () => noise(10)
  f().write(o0)
}
`, (ast) => {
    const loop = ast.plans[0]
    // The loop body should have 2 statements: VarAssign and ChainStmt
    // But wait, VarAssigns are hoisted to 'vars' in the root AST?
    // No, VarAssign inside a block stays in the block?
    // Let's check the parser logic for Block.
    if (loop.body.length !== 2) throw new Error(`Expected 2 statements in loop body, got ${loop.body.length}`)
    const assign = loop.body[0]
    if (assign.type !== 'VarAssign') throw new Error('Expected VarAssign first')
    const call = loop.body[1]
    if (call.chain[0].name !== 'f') throw new Error('Expected call to f second')
})

test('Search Directive - Single Namespace', 'search nd\nnoise(10).write(o0)', (ast) => {
    if (!ast.namespace) throw new Error('Expected namespace metadata')
    if (!ast.namespace.searchOrder) throw new Error('Expected searchOrder')
    if (ast.namespace.searchOrder.length !== 1) throw new Error('Expected 1 namespace in searchOrder')
    if (ast.namespace.searchOrder[0] !== 'nd') throw new Error('Expected nd in searchOrder')
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
})

test('Search Directive - Multiple Namespaces', 'search nd, basics, nm\nnoise(10).write(o0)', (ast) => {
    if (!ast.namespace) throw new Error('Expected namespace metadata')
    if (!ast.namespace.searchOrder) throw new Error('Expected searchOrder')
    if (ast.namespace.searchOrder.length !== 3) throw new Error('Expected 3 namespaces in searchOrder')
    if (ast.namespace.searchOrder[0] !== 'nd') throw new Error('Expected nd first')
    if (ast.namespace.searchOrder[1] !== 'basics') throw new Error('Expected basics second')
    if (ast.namespace.searchOrder[2] !== 'nm') throw new Error('Expected nm third')
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

test('Inline Namespace - Should Error', 'search nd\nnd.noise(10).write(o0)', () => {
    throw new Error('Should have thrown SyntaxError for inline namespace')
}, (e) => {
    // This test expects an error
    if (!(e instanceof SyntaxError)) throw new Error('Expected SyntaxError')
    if (!e.message.includes('Inline namespace syntax')) throw new Error('Expected inline namespace error message')
    console.log('PASS: Inline Namespace - Should Error (correctly caught)')
    return true
})

test('read() creates Read node', 'search basics\nread(o0).write(o1)', (ast) => {
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

test('write3d parses correctly', 'search basics\nnoise(10).write3d(vol0, geo0)', (ast) => {
    if (ast.plans.length !== 1) throw new Error('Expected 1 plan')
    const plan = ast.plans[0]
    // Chain includes Call + Write3D node
    if (plan.chain.length !== 2) throw new Error('Expected 2 elements in chain (Call + Write3D)')
    if (!plan.write3d) throw new Error('Expected write3d')
    if (plan.write3d.tex3d.name !== 'vol0') throw new Error('Expected tex3d vol0')
    if (plan.write3d.geo.name !== 'geo0') throw new Error('Expected geo geo0')
})
