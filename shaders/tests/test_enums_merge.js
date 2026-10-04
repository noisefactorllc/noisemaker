import assert from 'node:assert/strict'
import { mergeIntoEnums } from '../src/lang/enums.js'

// Enum sources can come from parsed JSON, where "__proto__" is an own key.
const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"safeNs":{"a":{"type":"Number","value":1}}}')

const result = await mergeIntoEnums(hostile)

assert.equal({}.polluted, undefined, 'Object.prototype must not be polluted')
assert.equal(Object.prototype.polluted, undefined, 'Object.prototype must not be polluted')
assert.deepEqual(result.safeNs.a, { type: 'Number', value: 1 }, 'legitimate keys still merge')
assert.equal(Object.hasOwn(result, 'constructor'), false, 'constructor key is skipped')

console.log('PASS: enum merge ignores prototype-polluting keys')
