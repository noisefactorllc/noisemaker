// shaders/tests/test_scene_math.js
import assert from 'assert'
import { mat4 as localMat4, vec3 as localVec3, quat as localQuat } from '../src/scene/linalg.js'
import {
  mat4,
  degToRad,
  radToDeg,
  eulerToQuat,
  quatToEuler,
  composeTransform,
  decomposeTransform,
  lookAtMatrix,
  viewUp,
  perspectiveMatrix,
  tileFrustumMatrix,
  reflectPointAcrossPlane,
  reflectDirectionAcrossPlane,
  planeFromWorldMatrix
} from '../src/scene/math.js'

function approx(a, b, eps = 1e-5) {
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)
}

function vecApprox(a, b, eps = 1e-5) {
  assert.strictEqual(a.length, b.length)
  for (let i = 0; i < a.length; i++) approx(a[i], b[i], eps)
}

// degToRad / radToDeg
approx(degToRad(180), Math.PI)
approx(degToRad(90), Math.PI / 2)
approx(radToDeg(Math.PI), 180)
approx(radToDeg(Math.PI / 2), 90)

// eulerToQuat round-trip
{
  const euler = [45, 90, 0] // degrees
  const q = eulerToQuat(euler)
  assert.strictEqual(q.length, 4)
  const len = Math.sqrt(q[0]*q[0] + q[1]*q[1] + q[2]*q[2] + q[3]*q[3])
  approx(len, 1.0)
  const back = quatToEuler(q)
  vecApprox(back, euler, 0.1)
}

// composeTransform: identity
{
  const m = composeTransform([0, 0, 0], [0, 0, 0], [1, 1, 1])
  assert.strictEqual(m.length, 16)
  approx(m[0], 1); approx(m[5], 1); approx(m[10], 1); approx(m[15], 1)
}

// composeTransform: translation
{
  const m = composeTransform([3, 4, 5], [0, 0, 0], [1, 1, 1])
  approx(m[12], 3); approx(m[13], 4); approx(m[14], 5)
}

// composeTransform: scale
{
  const m = composeTransform([0, 0, 0], [0, 0, 0], [2, 3, 4])
  approx(m[0], 2); approx(m[5], 3); approx(m[10], 4)
}

// decomposeTransform round-trip
{
  const pos = [1, 2, 3]
  const rot = [30, 45, 60]
  const scl = [1, 1, 1]
  const m = composeTransform(pos, rot, scl)
  const { position, scale } = decomposeTransform(m)
  vecApprox(position, pos)
  vecApprox(scale, scl)
}

// lookAtMatrix writes into the caller's buffer and hands it back, so a render
// loop can keep one matrix per view instead of minting one per call.
{
  const out = mat4.create()
  const m = lookAtMatrix(out, [0, 0, 5], [0, 0, 0], [0, 1, 0])
  assert.strictEqual(m, out, 'lookAtMatrix returns the buffer it was given')
  assert.strictEqual(m.length, 16)
}

// Every matrix helper writes all sixteen elements, which is what makes a reused
// buffer safe: none of them can carry a previous call's value forward.
{
  const dirty = () => mat4.fromValues(
    9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9)

  assert.deepStrictEqual(
    Array.from(lookAtMatrix(dirty(), [0, 0, 5], [0, 0, 0], [0, 1, 0])),
    Array.from(lookAtMatrix(mat4.create(), [0, 0, 5], [0, 0, 0], [0, 1, 0])),
    'lookAtMatrix overwrites a dirty buffer completely')
  // Its degenerate eye-equals-centre branch takes a different path out.
  assert.deepStrictEqual(
    Array.from(lookAtMatrix(dirty(), [1, 2, 3], [1, 2, 3], [0, 1, 0])),
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    'the degenerate lookAt writes a full identity, not a partial one')
  assert.deepStrictEqual(
    Array.from(perspectiveMatrix(dirty(), 60, 4 / 3, 0.1, 100)),
    Array.from(perspectiveMatrix(mat4.create(), 60, 4 / 3, 0.1, 100)),
    'perspectiveMatrix overwrites a dirty buffer completely')
  const tile = { x: 50, y: 50, width: 50, height: 50, fullWidth: 100, fullHeight: 100 }
  assert.deepStrictEqual(
    Array.from(tileFrustumMatrix(dirty(), 90, 1, 1000, tile)),
    Array.from(tileFrustumMatrix(mat4.create(), 90, 1, 1000, tile)),
    'tileFrustumMatrix overwrites a dirty buffer completely')
}

// lookAtMatrix rounds eye/centre/up to float32 before the arithmetic, exactly
// as the vec3.fromValues it replaced did. Pinned against a hand-rolled
// float32-in / float64-math reference so the reused scratch cannot silently
// start computing at double precision.
{
  const eye = [0.1, 0.2, 5.3]
  const center = [0.7, 0.30000000000000004, 0.1]
  const up = [0.1, 0.9, 0.2]
  const f32 = v => Array.from(new Float32Array(v))
  const expected = mat4.lookAt(mat4.create(), f32(eye), f32(center), f32(up))
  assert.deepStrictEqual(
    Array.from(lookAtMatrix(mat4.create(), eye, center, up)),
    Array.from(expected),
    'the view matrix is built from float32 inputs, not the raw float64 arrays')
}

// A view straight down or straight up has no sideways direction to take from
// an up vector that lies along it. The image top is then the one a viewer on
// the +Z side arrives at by tilting until the view is vertical: -Z looking
// down, +Z looking up. World +X stays to the right in both.
{
  const down = lookAtMatrix(mat4.create(), [0, 5, 0], [0, 0, 0], [0, 1, 0])
  vecApprox(Array.from(down), [
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, -5, 1
  ])
  const up = lookAtMatrix(mat4.create(), [0, -5, 0], [0, 0, 0], [0, 1, 0])
  vecApprox(Array.from(up), [
    1, 0, 0, 0,
    0, 0, -1, 0,
    0, 1, 0, 0,
    0, 0, -5, 1
  ])

  // The vertical view is where the tilting view from the +Z side ends up.
  const tilted = lookAtMatrix(mat4.create(), [0, 5, 0.001], [0, 0, 0], [0, 1, 0])
  vecApprox(Array.from(tilted), Array.from(down), 1e-3)
  const tiltedUp = lookAtMatrix(mat4.create(), [0, -5, 0.001], [0, 0, 0], [0, 1, 0])
  vecApprox(Array.from(tiltedUp), Array.from(up), 1e-3)

  // An up vector along Z leaves the same gap for a view along Z, which takes
  // +Y: the ordinary view from the front or from the back.
  for (const eye of [[0, 0, 5], [0, 0, -5]]) {
    for (const up of [[0, 0, 1], [0, 0, -1]]) {
      assert.deepStrictEqual(
        Array.from(lookAtMatrix(mat4.create(), eye, [0, 0, 0], up)),
        Array.from(lookAtMatrix(mat4.create(), eye, [0, 0, 0], [0, 1, 0])),
        'a view along an up vector that lies along Z is built with +Y')
    }
  }

  // An up vector of no length stands for +Y, in a level view and in a
  // vertical one.
  assert.deepStrictEqual(
    Array.from(lookAtMatrix(mat4.create(), [0, 0, 5], [0, 0, 0], [0, 0, 0])),
    Array.from(lookAtMatrix(mat4.create(), [0, 0, 5], [0, 0, 0], [0, 1, 0])))
  assert.deepStrictEqual(
    Array.from(lookAtMatrix(mat4.create(), [0, 5, 0], [0, 0, 0], [0, 0, 0])),
    Array.from(down))

  // viewUp() gives the up vector the matrix is built from, so that a mirrored
  // camera can mirror it. It is the caller's own wherever that one is usable.
  const out = new Float32Array(3)
  assert.strictEqual(viewUp(out, [0, 5, 0], [0, 0, 0], [0, 1, 0]), out, 'viewUp returns the buffer it was given')
  vecApprox(Array.from(out), [0, 0, -1])
  vecApprox(Array.from(viewUp(out, [0, -5, 0], [0, 0, 0], [0, 1, 0])), [0, 0, 1])
  assert.deepStrictEqual(
    Array.from(viewUp(out, [0.1, 0.2, 5.3], [0.7, 0.3, 0.1], [0.1, 0.9, 0.2])),
    Array.from(new Float32Array([0.1, 0.9, 0.2])),
    'a usable up vector is returned as given')

  // Any other up vector follows the same rule when the view runs along it:
  // -Z looking against it, +Z looking along it.
  assert.deepStrictEqual(Array.from(viewUp(out, [5, 0, 0], [0, 0, 0], [1, 0, 0])), [0, 0, -1])
  assert.deepStrictEqual(Array.from(viewUp(out, [-5, 0, 0], [0, 0, 0], [1, 0, 0])), [0, 0, 1])

  // Only a view exactly along its up vector takes another one. A view the
  // least bit off it has a sideways direction of its own, and keeps the frame
  // it always had: this eye is off the vertical by the smallest float32.
  assert.deepStrictEqual(Array.from(viewUp(out, [1.4e-45, 5, 0], [0, 0, 0], [0, 1, 0])), [0, 1, 0])

  // Exactly, on the float32 values the matrix is built from: this eye, and
  // then this centre, is off the vertical as given and on it once rounded.
  assert.deepStrictEqual(Array.from(viewUp(out, [1000.00002, 5, 0], [1000, 0, 0], [0, 1, 0])), [0, 0, -1])
  assert.deepStrictEqual(Array.from(viewUp(out, [1000, 5, 0], [1000.00002, 0, 0], [0, 1, 0])), [0, 0, -1])

  // An eye on its centre has no view to run along anything.
  assert.deepStrictEqual(Array.from(viewUp(out, [1, 2, 3], [1, 2, 3], [0, 1, 0])), [0, 1, 0])
}

// Planar reflection camera math
{
  const planePoint = [0, -0.6, 0]
  const planeNormal = [0, 1, 0]
  const reflectedPosition = new Float32Array(3)
  const reflectedTarget = new Float32Array(3)
  const reflectedUp = new Float32Array(3)

  reflectPointAcrossPlane(reflectedPosition, [0, 3.2, -8.5], planePoint, planeNormal)
  reflectPointAcrossPlane(reflectedTarget, [0, 0.6, 0], planePoint, planeNormal)
  reflectDirectionAcrossPlane(reflectedUp, [0, 1, 0], planeNormal)

  vecApprox(reflectedPosition, [0, -4.4, -8.5])
  vecApprox(reflectedTarget, [0, -1.8, 0])
  vecApprox(reflectedUp, [0, -1, 0])
}

// A plane primitive's local +Y axis and origin define its world-space plane
{
  const world = composeTransform([2, -0.6, 4], [0, 0, 0], [3, 1, 2])
  const point = new Float32Array(3)
  const normal = new Float32Array(3)
  planeFromWorldMatrix(point, normal, world)
  vecApprox(point, [2, -0.6, 4])
  vecApprox(normal, [0, 1, 0])
}

// Parent non-uniform transforms can shear a child plane; derive its normal
// from transformed tangents rather than trusting the world Y basis.
{
  const shearedWorld = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 1, 1, 0,
    0, 0, 0, 1
  ])
  const point = new Float32Array(3)
  const normal = new Float32Array(3)
  planeFromWorldMatrix(point, normal, shearedWorld)
  const invSqrt2 = 1 / Math.sqrt(2)
  vecApprox(normal, [0, invSqrt2, -invSqrt2])
}

console.log('Scene math tests passed')

// The scene runtime must use local, browser-loadable matrix operations.
{
  assert.deepStrictEqual(Array.from(localVec3.fromValues(1, 2, 3)), [1, 2, 3])
  assert.deepStrictEqual(Array.from(localQuat.create()), [0, 0, 0, 1])
  const matrix = localMat4.fromValues(1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 4, 0, 2, 4, 8, 1)
  const inverse = localMat4.invert(localMat4.create(), matrix)
  vecApprox(Array.from(localMat4.multiply(localMat4.create(), matrix, inverse)),
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  const singular = localMat4.fromValues(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
  const untouched = localMat4.create()
  assert.strictEqual(localMat4.invert(untouched, singular), null)
  assert.deepStrictEqual(Array.from(untouched), Array.from(localMat4.create()))
}

// Preserve established transform and camera outputs while replacing the math dependency.
{
  const matrix = composeTransform([1.25, -2.5, 0.125], [30, 45, 60], [2, 3, 4])
  assert.deepStrictEqual(Array.from(matrix), [
    0.7071067690849304, 1.2247449159622192, -1.4142136573791504, 0,
    -1.719670057296753, 2.2175967693328857, 1.0606602430343628, 0,
    2.9567956924438477, 1.121320366859436, 2.4494898319244385, 0,
    1.25, -2.5, 0.125, 1
  ])
  assert.deepStrictEqual(Array.from(mat4.invert(mat4.create(), matrix)), [
    0.1767766773700714, -0.1910744309425354, 0.18479973077774048, 0,
    0.3061862289905548, 0.2463996261358261, 0.07008253037929535, 0,
    -0.3535533547401428, 0.117851123213768, 0.1530930995941162, 0,
    0.588688850402832, 0.840110719203949, -0.07492997497320175, 1
  ])
  assert.deepStrictEqual(Array.from(lookAtMatrix(mat4.create(), [0.1, 0.2, 5.3], [0.7, 0.3, 0.1], [0.1, 0.9, 0.2])), [
    0.9847278594970703, 0.13106150925159454, -0.114603191614151, 0,
    -0.1340906023979187, 0.9907850027084351, -0.019100533798336983, 0,
    0.1110437735915184, 0.034176040440797806, 0.9932277202606201, 0,
    -0.6601867079734802, -0.3923961818218231, -5.248826503753662, 1
  ])
}
