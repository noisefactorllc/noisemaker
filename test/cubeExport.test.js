import assert from 'assert'
import { crossLayout, faceFileNames, CROSS_CELL } from '../shaders/src/renderer/cubeExport.js'
import { faceBasisMat3 } from '../shaders/src/renderer/cubeCamera.js'

const face = (w, h, fill) => ({ width: w, height: h, data: new Uint8Array(w * h * 4).fill(fill) })
const faces = [0, 1, 2, 3, 4, 5].map((i) => face(2, 2, i * 10))

const cross = crossLayout(faces)
assert.strictEqual(cross.width, 8, 'cross width = 4*size')   // 4 columns
assert.strictEqual(cross.height, 6, 'cross height = 3*size') // 3 rows
assert.strictEqual(cross.data.length, 8 * 6 * 4, 'cross buffer size')

// Seamless ordering for these bases: equator row (row 1) is +X +Z -X -Z (cols 0..3),
// with +Y above and -Y below +Z (col 1). Faces are filled by index*10:
//   +X=0  -X=10  +Y=20  -Y=30  +Z=40  -Z=50
const size = 2, W = 8
const cellTopLeft = (col, row) => cross.data[((row * size) * W + (col * size)) * 4]
assert.strictEqual(cellTopLeft(0, 1), 0, '+X at col0,row1')
assert.strictEqual(cellTopLeft(1, 1), 40, '+Z at col1,row1')
assert.strictEqual(cellTopLeft(2, 1), 10, '-X at col2,row1')
assert.strictEqual(cellTopLeft(3, 1), 50, '-Z at col3,row1')
assert.strictEqual(cellTopLeft(1, 0), 20, '+Y above +Z')
assert.strictEqual(cellTopLeft(1, 2), 30, '-Y below +Z')

assert.deepStrictEqual(faceFileNames(), ['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png'])

// LAYOUT SEAM PROOF (validates THIS layout, not just that the cube closes): derive the
// interior borders from CROSS_CELL and assert that adjacent cells share coincident ray
// directions there, under the shader's rd = normalize(u*right - v*up + forward)
// (basis*(u,-v,1)) and top-down readback (cell row 0 = v=+1, left col = u=-1). This
// FAILS if CROSS_CELL is reordered to a non-seam-continuous layout (e.g. the old
// -X +Z +X -Z equator gives gap 2.0) — i.e. it can actually catch the regression it names.
const FACE = { 0: 'PX', 1: 'NX', 2: 'PY', 3: 'NY', 4: 'PZ', 5: 'NZ' }
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l] }
const rdir = (face, u, v) => {
  const m = faceBasisMat3(face) // columns [right | up | forward]
  return norm([u * m[0] - v * m[3] + m[6], u * m[1] - v * m[4] + m[7], u * m[2] - v * m[5] + m[8]])
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
let interiorBorders = 0, worstLayoutGap = 0
for (let A = 0; A < 6; A++) {
  for (let B = A + 1; B < 6; B++) {
    const [ca, ra] = CROSS_CELL[A], [cb, rb] = CROSS_CELL[B]
    let gap = null
    if (ra === rb && Math.abs(ca - cb) === 1) {
      // horizontal neighbors: left cell right edge (u=+1) vs right cell left edge (u=-1)
      const [L, R] = ca < cb ? [A, B] : [B, A]
      gap = 0
      for (let i = 0; i <= 32; i++) { const v = -1 + i / 16; gap = Math.max(gap, dist(rdir(L, 1, v), rdir(R, -1, v))) }
    } else if (ca === cb && Math.abs(ra - rb) === 1) {
      // vertical neighbors: top cell bottom edge (v=-1) vs bottom cell top edge (v=+1)
      const [T, Bot] = ra < rb ? [A, B] : [B, A]
      gap = 0
      for (let i = 0; i <= 32; i++) { const u = -1 + i / 16; gap = Math.max(gap, dist(rdir(T, u, -1), rdir(Bot, u, 1))) }
    }
    if (gap !== null) {
      interiorBorders++
      worstLayoutGap = Math.max(worstLayoutGap, gap)
      assert.ok(gap < 1e-9, `cross border ${FACE[A]}|${FACE[B]} not seam-continuous (gap ${gap})`)
    }
  }
}
assert.strictEqual(interiorBorders, 5, `expected 5 interior cross borders, found ${interiorBorders}`)
assert.ok(worstLayoutGap < 1e-9, `worst cross-layout border gap ${worstLayoutGap}`)

console.log('All cubeExport tests passed')
