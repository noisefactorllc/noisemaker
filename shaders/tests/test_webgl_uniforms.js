/**
 * WebGL2 backend: a typed array given for a vec2, vec3 or vec4 uniform.
 *
 * A scene pass gives its vectors as typed arrays, and the backend reads their
 * components. For a pass of an effect definition a typed array is one value,
 * repeated for every component, as in 1.x: only a plain array gives
 * components there.
 */

import assert from 'assert'
import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'

const calls = []
const gl = {
  FLOAT_VEC2: 0x8B50,
  FLOAT_VEC3: 0x8B51,
  FLOAT_VEC4: 0x8B52,
  uniform2fv(_location, value) { calls.push(['vec2', Array.from(value)]) },
  uniform3fv(_location, value) { calls.push(['vec3', Array.from(value)]) },
  uniform4fv(_location, value) { calls.push(['vec4', Array.from(value)]) }
}

const backend = Object.create(WebGL2Backend.prototype)
backend.gl = gl
backend._vec2Buf = new Float32Array(2)
backend._vec3Buf = new Float32Array(3)
backend._vec4Buf = new Float32Array(4)

const program = {
  uniforms: {
    u_vec2: { location: 1, type: gl.FLOAT_VEC2 },
    u_vec3: { location: 2, type: gl.FLOAT_VEC3 },
    u_vec4: { location: 3, type: gl.FLOAT_VEC4 }
  }
}

function bound(uniforms, state) {
  calls.length = 0
  backend.bindUniforms({ uniforms }, program, state)
  return calls.map(([name, value]) => [name, [...value]])
}

const EFFECT_STATE = {}
const SCENE_STATE = { scenePasses: true }

const typed = () => ({
  u_vec2: new Float32Array([2, 3]),
  u_vec3: new Float32Array([4, 5, 6]),
  u_vec4: new Float32Array([7, 8, 9, 10])
})
const plain = { u_vec2: [2, 3], u_vec3: [4, 5, 6], u_vec4: [7, 8, 9, 10] }
const components = [
  ['vec2', [2, 3]],
  ['vec3', [4, 5, 6]],
  ['vec4', [7, 8, 9, 10]]
]

// A scene pass: the components of the typed array.
assert.deepStrictEqual(bound(typed(), SCENE_STATE), components)

// A global uniform of a scene frame follows the same rule.
assert.deepStrictEqual(
  bound({}, { ...SCENE_STATE, globalUniforms: { u_vec2: new Float32Array([2, 3]) } }),
  [['vec2', [2, 3]]]
)

// A pass of an effect definition: a typed array is one value. A typed array
// of one element is that number, repeated for every component.
const one = { u_vec2: new Float32Array([0.5]), u_vec3: new Float32Array([0.5]), u_vec4: new Float32Array([0.5]) }
assert.deepStrictEqual(bound(one, EFFECT_STATE), [
  ['vec2', [0.5, 0.5]],
  ['vec3', [0.5, 0.5, 0.5]],
  ['vec4', [0.5, 0.5, 0.5, 0.5]]
])

// A typed array of several elements is not a number, so no component is one.
for (const [name, value] of bound(typed(), EFFECT_STATE)) {
  assert.ok(value.every(Number.isNaN), `${name}: expected no component from a typed array, got ${value}`)
}
assert.deepStrictEqual(
  bound({}, { globalUniforms: { u_vec2: new Float32Array([0.5]) } }),
  [['vec2', [0.5, 0.5]]]
)

// A plain array gives the components for every pass.
assert.deepStrictEqual(bound(plain, EFFECT_STATE), components)
assert.deepStrictEqual(bound(plain, SCENE_STATE), components)

console.log('All WebGL uniform tests passed')
