import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const harnessUrl = new URL('./test_parser.js', import.meta.url)
let source = readFileSync(harnessUrl, 'utf8')

for (const modulePath of [
    '../src/lang/lexer.js',
    '../src/lang/parser.js'
]) {
    source = source.replace(`'${modulePath}'`, `'${new URL(modulePath, harnessUrl).href}'`)
}

source += "\ntest('Exit-status regression probe', 'search synth\\nnoise(10).write(o0)', () => { throw new Error('intentional exit-status regression probe') })\n"

const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8'
})

assert.equal(result.signal, null, `Harness terminated by signal ${result.signal}`)
assert.match(result.stdout, /PASS: Simple Chain/)
assert.match(result.stderr, /FAIL: Exit-status regression probe/)
assert.match(result.stderr, /intentional exit-status regression probe/)
assert.notEqual(result.status, 0, 'A caught parser test failure must exit nonzero')

console.log('PASS: parser test failures exit nonzero')
