import assert from 'assert'
import { readFileSync } from 'fs'
import { tokenize } from '../js/noisemaker/dsl/tokenizer.js'
import { parse } from '../js/noisemaker/dsl/parser.js'

// Basic parse
const ast = parse(tokenize('{ layers: [noise()] }'))
assert.strictEqual(ast.type, 'Program')
assert.strictEqual(ast.body.type, 'ObjectExpr')

// Unknown key should throw
let error = null
try {
  parse(tokenize('{ foo: 1 }'))
} catch (e) {
  error = e
}
assert.ok(error instanceof Error)
assert.ok(error.message.includes('Unknown key'))

// Duplicate key should throw
error = null
try {
  parse(tokenize('{ layers: [], layers: [] }'))
} catch (e) {
  error = e
}
assert.ok(error instanceof Error)
assert.ok(error.message.includes('Duplicate key'))

// Ternary parsing
let tern = parse(tokenize('coin_flip() ? 1 : 2'))
assert.strictEqual(tern.body.type, 'TernaryExpr')

// Null literal parsing
let n = parse(tokenize('null'))
assert.strictEqual(n.body.type, 'NullLiteral')

// Named argument using equals
const astEq = parse(tokenize('rotate(angle=45)'))
assert.strictEqual(astEq.body.type, 'CallExpr')

// Python-style conditional expression
const astIf = parse(tokenize('1 if true else 2'))
assert.strictEqual(astIf.body.type, 'TernaryExpr')

// Unary expressions
const unary = parse(tokenize('-1'))
assert.strictEqual(unary.body.type, 'UnaryExpr')

// Unary after multiplication
const mulUnaryMinus = parse(tokenize('1 * -2'))
assert.strictEqual(mulUnaryMinus.body.type, 'BinaryExpr')
const mulUnaryPlus = parse(tokenize('1 * +2'))
assert.strictEqual(mulUnaryPlus.body.type, 'BinaryExpr')

// C-style comments should be ignored
const commentSource = `
// Leading single-line comment
{
    /* Multi-line
       comment */
    layers: [noise()] // Trailing single-line comment
}
`
const commentAst = parse(tokenize(commentSource))
assert.strictEqual(commentAst.body.type, 'ObjectExpr')

// Unterminated multi-line comment should throw
error = null
try {
  tokenize('/* unterminated comment')
} catch (e) {
  error = e
}
assert.ok(error instanceof Error)
assert.ok(error.message.includes('Unterminated multi-line comment'))

// A number that starts with "." keeps the dot: ".5" is 0.5, not 5
for (const [text, expected] of [['.5', 0.5], ['.025', 0.025], ['.06', 0.06], ['0.5', 0.5], ['5', 5], ['1.', 1]]) {
  const tokens = tokenize(text)
  assert.strictEqual(tokens.length, 1, text)
  assert.strictEqual(tokens[0].type, 'number', text)
  assert.strictEqual(tokens[0].value, expected, text)
  assert.strictEqual(tokens[0].column, 1, text)
}
const leadingDot = parse(tokenize('.025 + random() * 0.1'))
assert.strictEqual(leadingDot.body.type, 'BinaryExpr')
assert.strictEqual(leadingDot.body.left.value, 0.025)

// The presets that write a leading-dot number get the fraction
const presetsAst = parse(tokenize(readFileSync(new URL('../share/dsl/presets.dsl', import.meta.url), 'utf8')), false)
const presetByName = Object.fromEntries(presetsAst.body.properties.map((p) => [p.key, p.value]))
for (const [name, list, effect, arg, expected] of [
  ['convolution-feedback', 'post', 'conv_feedback', 'alpha', 0.5],
  ['corrupt', 'post', 'warp', 'displacement', 0.025],
  ['degauss', 'final', 'degauss', 'displacement', 0.06],
]) {
  const calls = presetByName[name].properties.find((p) => p.key === list).value.elements
  let node = calls.find((call) => call.callee.name === effect).args.named[arg]
  while (node.type === 'BinaryExpr') node = node.left
  assert.strictEqual(node.value, expected, `${name} ${effect}(${arg}:)`)
}

console.log('parser tests passed')
