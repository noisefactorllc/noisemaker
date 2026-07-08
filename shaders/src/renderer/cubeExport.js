// Assemble 6 cube faces (+X,-X,+Y,-Y,+Z,-Z) into export layouts. Pure pixel math.
const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']

export function faceFileNames() {
  return FACE_NAMES.map((n) => `${n}.png`)
}

// Horizontal cross (4 cols × 3 rows), ordered for THESE face bases so adjacent
// cells share cube edges. Equator L→R: +X +Z -X -Z; +Y above +Z, -Y below.
//        [+Y]
//   [+X] [+Z] [-X] [-Z]
//        [-Y]
// Guarantee (proven in test/cubeExport.test.js): ray directions are CONTINUOUS
// across every interior border, under the shader's (u,-v,1) formula and top-down
// readback (webgl2.js readPixels flips gl.readPixels to top-down). Cubemap renderers
// sample edge pixels exactly at u/v = +/-1, so adjacent exported borders land on the
// same ray directions. The ordering depends on top-down readback: a bottom-up buffer
// would flip the +Y/-Y caps.
// Grid cell (col, row) per face index (px,nx,py,ny,pz,nz):
export const CROSS_CELL = [
  [0, 1], // +X
  [2, 1], // -X
  [1, 0], // +Y
  [1, 2], // -Y
  [1, 1], // +Z
  [3, 1], // -Z
]

export function crossLayout(faces) {
  const size = faces[0].width
  const W = size * 4, H = size * 3
  const data = new Uint8Array(W * H * 4)
  for (let f = 0; f < 6; f++) {
    const [cx, cy] = CROSS_CELL[f]
    const src = faces[f].data
    const ox = cx * size, oy = cy * size
    for (let y = 0; y < size; y++) {
      const dstRow = ((oy + y) * W + ox) * 4
      const srcRow = (y * size) * 4
      data.set(src.subarray(srcRow, srcRow + size * 4), dstRow)
    }
  }
  return { width: W, height: H, data }
}
