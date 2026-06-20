import assert from 'assert'
import {
  CUBE_FACES, faceRight, faceDirection, directionToFaceUV, faceBasisMat3,
} from '../shaders/src/renderer/cubeCamera.js'

const len = (v) => Math.hypot(v[0], v[1], v[2])
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// 6 faces, orthonormal right-handed bases
assert.strictEqual(CUBE_FACES.length, 6, 'expected 6 faces')
for (let f = 0; f < 6; f++) {
  const fwd = CUBE_FACES[f].forward
  const up = CUBE_FACES[f].up
  const right = faceRight(f)
  assert.ok(Math.abs(len(fwd) - 1) < 1e-9, `forward ${f} unit`)
  assert.ok(Math.abs(len(up) - 1) < 1e-9, `up ${f} unit`)
  assert.ok(Math.abs(len(right) - 1) < 1e-9, `right ${f} unit`)
  assert.ok(Math.abs(dot(fwd, up)) < 1e-9, `fwd·up ${f}`)
  assert.ok(Math.abs(dot(fwd, right)) < 1e-9, `fwd·right ${f}`)
  assert.ok(Math.abs(dot(up, right)) < 1e-9, `up·right ${f}`)
}

// faceDirection returns unit vectors
for (let f = 0; f < 6; f++) {
  for (const [u, v] of [[0, 0], [1, 1], [-1, 1], [0.3, -0.7]]) {
    assert.ok(Math.abs(len(faceDirection(f, u, v)) - 1) < 1e-9, `dir unit ${f} ${u} ${v}`)
  }
}

// INVERTIBILITY: faceDirection ∘ directionToFaceUV round-trips for all faces and
// uv in [-1,1]^2 including the exact edges. This proves the projection inverts
// correctly — NOT, on its own, that adjacent faces agree at edges. The real seam
// proof is the adjacency check below (measured against the shader's own formula).
for (let f = 0; f < 6; f++) {
  for (let iu = -1; iu <= 1; iu++) {
    for (let iv = -1; iv <= 1; iv++) {
      const u = iu, v = iv
      const dir = faceDirection(f, u, v)
      const back = directionToFaceUV(dir)
      const dir2 = faceDirection(back.face, back.u, back.v)
      assert.ok(Math.abs(dir2[0] - dir[0]) < 1e-9 &&
                Math.abs(dir2[1] - dir[1]) < 1e-9 &&
                Math.abs(dir2[2] - dir[2]) < 1e-9,
        `round-trip face ${f} u ${u} v ${v} -> dir mismatch`)
    }
  }
}

// faceBasisMat3 columns equal [right | up | forward]
for (let f = 0; f < 6; f++) {
  const m = faceBasisMat3(f)
  const right = faceRight(f)
  assert.deepStrictEqual(m.slice(0, 3), right, `basis col0 ${f}`)
  assert.deepStrictEqual(m.slice(3, 6), CUBE_FACES[f].up, `basis col1 ${f}`)
  assert.deepStrictEqual(m.slice(6, 9), CUBE_FACES[f].forward, `basis col2 ${f}`)
}

// CLOSED-CUBE INVARIANT: the shader marches rd = normalize(cubeBasis · vec3(u, -v, 1)),
// cubeBasis columns = [right | up | forward]. This proves the 6 BASES form a gap-free
// cube — every face edge's direction set is reproduced exactly on SOME other face's
// edge — so the rendered faces have coincident edges (a basis/handedness bug would
// break this). It does NOT validate the cross-image LAYOUT (which face is placed next
// to which); that ordered-adjacency check lives in test/cubeExport.test.js.
// Measure, over all 24 face-edges, the worst of (max over A-edge points of the min
// distance to the best-matching other-face edge). It must be ~0.
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l] }
const shaderDir = (face, u, v) => {
  const m = faceBasisMat3(face) // [r | up | fwd] columns; shader uses (u, -v, 1)
  return norm3([u * m[0] - v * m[3] + m[6], u * m[1] - v * m[4] + m[7], u * m[2] - v * m[5] + m[8]])
}
const EDGE = [(t) => [1, t], (t) => [-1, t], (t) => [t, 1], (t) => [t, -1]]
const edgeDirs = (face, e) => {
  const out = []
  for (let i = 0; i <= 32; i++) { const t = -1 + i / 16; const [u, v] = EDGE[e](t); out.push(shaderDir(face, u, v)) }
  return out
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
let worstEdgeGap = 0
for (let A = 0; A < 6; A++) for (let ea = 0; ea < 4; ea++) {
  const da = edgeDirs(A, ea)
  let best = Infinity
  for (let B = 0; B < 6; B++) {
    if (B === A) continue
    for (let eb = 0; eb < 4; eb++) {
      const db = edgeDirs(B, eb)
      let mx = 0
      for (const p of da) { let mn = Infinity; for (const q of db) mn = Math.min(mn, dist3(p, q)); mx = Math.max(mx, mn) }
      best = Math.min(best, mx)
    }
  }
  worstEdgeGap = Math.max(worstEdgeGap, best)
}
assert.ok(worstEdgeGap < 1e-9, `cube edges must coincide across adjacent faces (worst gap ${worstEdgeGap})`)

console.log('All cubeCamera tests passed')
