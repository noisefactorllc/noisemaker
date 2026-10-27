// Column-major linear algebra for scene transforms.
const multiplyScratch = new Float64Array(16)
const inverseScratch = new Float64Array(32)

export const vec3 = {
  create: () => new Float32Array(3),
  fromValues: (x, y, z) => new Float32Array([x, y, z])
}

export const quat = {
  create: () => new Float32Array([0, 0, 0, 1]),
  fromEuler(out, x, y, z) {
    const sx = Math.sin(x * Math.PI / 360), cx = Math.cos(x * Math.PI / 360)
    const sy = Math.sin(y * Math.PI / 360), cy = Math.cos(y * Math.PI / 360)
    const sz = Math.sin(z * Math.PI / 360), cz = Math.cos(z * Math.PI / 360)
    out[0] = sx * cy * cz - cx * sy * sz
    out[1] = cx * sy * cz + sx * cy * sz
    out[2] = cx * cy * sz - sx * sy * cz
    out[3] = cx * cy * cz + sx * sy * sz
    return out
  }
}

export const mat4 = {
  create() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) },
  fromValues(...values) { return new Float32Array(values) },
  identity(out) { for (let i = 0; i < 16; i++) out[i] = i % 5 === 0 ? 1 : 0; return out },
  copy(out, a) { for (let i = 0; i < 16; i++) out[i] = a[i]; return out },
  multiply(out, a, b) {
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        multiplyScratch[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3]
      }
    }
    for (let i = 0; i < 16; i++) out[i] = multiplyScratch[i]
    return out
  },
  transpose(out, a) {
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) multiplyScratch[col * 4 + row] = a[row * 4 + col]
    for (let i = 0; i < 16; i++) out[i] = multiplyScratch[i]
    return out
  },
  invert(out, a) {
    const m = inverseScratch
    for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) m[row * 8 + col] = col < 4 ? a[col * 4 + row] : Number(col - 4 === row)
    for (let col = 0; col < 4; col++) {
      let pivot = col
      for (let row = col + 1; row < 4; row++) if (Math.abs(m[row * 8 + col]) > Math.abs(m[pivot * 8 + col])) pivot = row
      if (!m[pivot * 8 + col]) return null
      if (pivot !== col) for (let j = 0; j < 8; j++) { const v = m[pivot * 8 + j]; m[pivot * 8 + j] = m[col * 8 + j]; m[col * 8 + j] = v }
      const factor = m[col * 8 + col]
      for (let j = 0; j < 8; j++) m[col * 8 + j] /= factor
      for (let row = 0; row < 4; row++) if (row !== col) {
        const scale = m[row * 8 + col]
        for (let j = 0; j < 8; j++) m[row * 8 + j] -= scale * m[col * 8 + j]
      }
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) out[col * 4 + row] = m[row * 8 + col + 4]
    return out
  },
  fromRotationTranslationScale(out, q, p, s) {
    const [x, y, z, w] = q
    const xx = x * x * 2, yy = y * y * 2, zz = z * z * 2
    const xy = x * y * 2, xz = x * z * 2, yz = y * z * 2
    const wx = w * x * 2, wy = w * y * 2, wz = w * z * 2
    out[0] = (1 - yy - zz) * s[0]; out[1] = (xy + wz) * s[0]; out[2] = (xz - wy) * s[0]; out[3] = 0
    out[4] = (xy - wz) * s[1]; out[5] = (1 - xx - zz) * s[1]; out[6] = (yz + wx) * s[1]; out[7] = 0
    out[8] = (xz + wy) * s[2]; out[9] = (yz - wx) * s[2]; out[10] = (1 - xx - yy) * s[2]; out[11] = 0
    out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1
    return out
  },
  getTranslation(out, m) { out[0] = m[12]; out[1] = m[13]; out[2] = m[14]; return out },
  getScaling(out, m) {
    out[0] = Math.hypot(m[0], m[1], m[2]); out[1] = Math.hypot(m[4], m[5], m[6]); out[2] = Math.hypot(m[8], m[9], m[10]); return out
  },
  getRotation(out, m) {
    const sx = Math.fround(Math.hypot(m[0], m[1], m[2])), sy = Math.fround(Math.hypot(m[4], m[5], m[6])), sz = Math.fround(Math.hypot(m[8], m[9], m[10]))
    const a = m[0] / sx, b = m[1] / sy, c = m[2] / sz, d = m[4] / sx, e = m[5] / sy, f = m[6] / sz, g = m[8] / sx, h = m[9] / sy, i = m[10] / sz
    const trace = a + e + i
    let t
    if (trace > 0) { t = Math.sqrt(trace + 1) * 2; out[3] = t / 4; out[0] = (f - h) / t; out[1] = (g - c) / t; out[2] = (b - d) / t }
    else if (a > e && a > i) { t = Math.sqrt(1 + a - e - i) * 2; out[3] = (f - h) / t; out[0] = t / 4; out[1] = (b + d) / t; out[2] = (g + c) / t }
    else if (e > i) { t = Math.sqrt(1 + e - a - i) * 2; out[3] = (g - c) / t; out[0] = (b + d) / t; out[1] = t / 4; out[2] = (f + h) / t }
    else { t = Math.sqrt(1 + i - a - e) * 2; out[3] = (b - d) / t; out[0] = (g + c) / t; out[1] = (f + h) / t; out[2] = t / 4 }
    return out
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2)
    out.fill(0); out[0] = f / aspect; out[5] = f; out[11] = -1
    if (far != null && far !== Infinity) { const inv = 1 / (near - far); out[10] = (far + near) * inv; out[14] = 2 * far * near * inv }
    else { out[10] = -1; out[14] = -2 * near }
    return out
  },
  frustum(out, left, right, bottom, top, near, far) {
    const rl = 1 / (right - left), tb = 1 / (top - bottom), nf = 1 / (near - far)
    out.fill(0); out[0] = 2 * near * rl; out[5] = 2 * near * tb; out[8] = (right + left) * rl; out[9] = (top + bottom) * tb
    out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf
    return out
  },
  lookAt(out, eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2]
    if (Math.abs(zx) < 1e-6 && Math.abs(zy) < 1e-6 && Math.abs(zz) < 1e-6) return mat4.identity(out)
    let n = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz); zx *= n; zy *= n; zz *= n
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx
    n = Math.sqrt(xx * xx + xy * xy + xz * xz); n = n ? 1 / n : 0; xx *= n; xy *= n; xz *= n
    let yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx
    n = Math.sqrt(yx * yx + yy * yy + yz * yz); n = n ? 1 / n : 0; yx *= n; yy *= n; yz *= n
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]); out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]); out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]); out[15] = 1
    return out
  }
}
