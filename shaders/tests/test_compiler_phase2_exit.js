import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const harnessUrl = new URL('./test_compiler_phase2.js', import.meta.url)
let source = readFileSync(harnessUrl, 'utf8')

for (const modulePath of [
    '../src/lang/lexer.js',
    '../src/lang/parser.js',
    '../src/lang/validator.js',
    '../src/lang/ops.js'
]) {
    source = source.replace(`'${modulePath}'`, `'${new URL(modulePath, harnessUrl).href}'`)
}

const compileLine = '        const result = compile(code)'
assert.ok(source.includes(compileLine), 'Phase-2 harness compile line must exist')
source = source.replace(
    compileLine,
    "        throw new Error('intentional exit-status regression probe')\n" + compileLine
)

const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8'
})

assert.equal(result.signal, null, `Harness terminated by signal ${result.signal}`)
assert.match(result.stderr, /FAIL: Variable Alias \(Function\)/)
assert.match(result.stderr, /intentional exit-status regression probe/)
assert.notEqual(result.status, 0, 'A caught phase-2 assertion failure must exit nonzero')

console.log('PASS: compiler phase-2 failures exit nonzero')
