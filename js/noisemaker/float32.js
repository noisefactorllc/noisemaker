// Float32 elementwise math with the algorithms of the vectorized float32
// kernels (fused multiply-add packet math) behind tf.sin, tf.cos and tf.pow.
// The JavaScript port uses these where a one-ulp difference from the Python
// reference changes a later result, such as a truncated pixel index.

const _f32Bits = new Float32Array(1)
const _i32Bits = new Int32Array(_f32Bits.buffer)

// The float32 neighbor of a finite float32 value `r`, in the direction of `toward`.
function nextFloat32(r, toward) {
  _f32Bits[0] = r
  if (r === 0) {
    _i32Bits[0] = 1
    return toward > 0 ? _f32Bits[0] : -_f32Bits[0]
  }
  _i32Bits[0] += (toward > r) === (r > 0) ? 1 : -1
  return _f32Bits[0]
}

// Fused multiply-add of float32 values with a single float32 rounding, as
// float32 FMA hardware computes it.
export function fma32(a, b, c) {
  const p = a * b // exact: a and b have 24-bit significands
  const s = p + c
  const v = s - p
  const err = (p - (s - v)) + (c - v) // p + c === s + err exactly
  const r = Math.fround(s)
  if (err === 0 || r === s) return r
  const other = nextFloat32(r, s)
  if ((r + other) / 2 !== s) return r
  // s lies halfway between two float32 values; the exact sum does not.
  return err > 0 === other > r ? other : r
}

const SINCOS_TWO_OVER_PI = Math.fround(0.636619746685028076171875)
const SINCOS_PIO2_HI = Math.fround(-1.57079601287841796875)
const SINCOS_PIO2_MID = Math.fround(-3.1391647326017846353352069854736328125e-7)
const SINCOS_PIO2_LO = Math.fround(-5.390302529957764765544681040410068817436695098876953125e-15)
const COS_C0 = Math.fround(2.4372266125283204019069671630859375e-5)
const COS_C1 = Math.fround(-0.00138865201734006404876708984375)
const COS_C2 = Math.fround(0.041666619479656219482421875)
const SIN_C0 = Math.fround(-0.0001959234114083702898469196984621021329076029360294342041015625)
const SIN_C1 = Math.fround(0.0083326873655616851693794799871284340042620897293090820312500000)
const SIN_C2 = Math.fround(-0.1666666203982298255503735617821803316473960876464843750000000000)

// Float32 sine or cosine with the range reduction and polynomials of the
// vectorized float32 kernels that tf.sin and tf.cos use.
function sincos32(value, sine) {
  const x0 = Math.fround(value)
  let x = Math.abs(x0)
  if (!(x < (sine ? 117435.992 : 71476.0625))) {
    return Math.fround(sine ? Math.sin(x0) : Math.cos(x0))
  }
  const k = Math.fround(Math.fround(x * SINCOS_TWO_OVER_PI) + 12582912) - 12582912
  x = fma32(k, SINCOS_PIO2_HI, x)
  x = fma32(k, SINCOS_PIO2_MID, x)
  x = fma32(k, SINCOS_PIO2_LO, x)
  const x2 = Math.fround(x * x)
  let even = fma32(COS_C0, x2, COS_C1)
  even = fma32(even, x2, COS_C2)
  even = fma32(even, x2, -0.5)
  even = fma32(even, x2, 1)
  let odd = fma32(SIN_C0, x2, SIN_C1)
  odd = fma32(odd, x2, SIN_C2)
  odd = Math.fround(odd * x2)
  odd = fma32(odd, x, x)
  const quadrant = k | 0
  let result
  let negative
  if (sine) {
    result = (quadrant & 1) === 0 ? odd : even
    negative = (((quadrant >> 1) & 1) === 1) !== (x0 < 0 || Object.is(x0, -0))
  } else {
    result = (quadrant & 1) === 0 ? even : odd
    negative = (((quadrant + 1) >> 1) & 1) === 1
  }
  return negative ? -result : result
}

export function sin32(value) {
  return sincos32(value, true)
}

// The vectorized kernels handle a tensor in packets of four values. The last
// `count % 4` values go through the scalar math library instead, which
// rounds like the float64 result rounded to float32 in nearly all cases.
export function packetEnd(count) {
  return count - (count % 4)
}

export function sinScalar32(value) {
  return Math.fround(Math.sin(Math.fround(value)))
}

export function powScalar32(base, exponent) {
  return Math.fround(Math.pow(Math.fround(base), Math.fround(exponent)))
}

export function cos32(value) {
  return sincos32(value, false)
}

// Double-word helpers for pow32. Each value is a float32.
function twoProd32(x, y) {
  const hi = Math.fround(x * y)
  return [hi, fma32(x, y, -hi)]
}

function fastTwoSum32(x, y) {
  const s = Math.fround(x + y)
  return [s, Math.fround(y - Math.fround(s - x))]
}

function dwFastTwoSum32(xHi, xLo, yHi, yLo) {
  const [rHi, rLo] = fastTwoSum32(xHi, yHi)
  return fastTwoSum32(rHi, Math.fround(Math.fround(yLo + rLo) + xLo))
}

function dwTwoProd32(xHi, xLo, y) {
  const [cHi, cLo1] = twoProd32(xHi, y)
  const [tHi, tLo1] = fastTwoSum32(cHi, Math.fround(xLo * y))
  return fastTwoSum32(tHi, Math.fround(tLo1 + cLo1))
}

const LOG2_C0 = 1.442695041742110273474963832995854318141937255859375
const LOG2_C0_HI = Math.fround(LOG2_C0)
const LOG2_C0_LO = Math.fround(LOG2_C0 - LOG2_C0_HI)
const LOG2_C1 = -7.2134751588268664068692714863573201000690460205078125e-1
const LOG2_C1_HI = Math.fround(LOG2_C1)
const LOG2_C1_LO = Math.fround(LOG2_C1 - LOG2_C1_HI)
const LOG2_POLY = [
  9.7010828554630279541015625e-2, -1.68964862823486328125e-1,
  1.720083653926849365234375e-1, -1.7892272770404815673828125e-1,
  2.0505344867706298828125e-1, -2.40466773509979248046875e-1,
  2.8857553005218505859375e-1, -3.606741428375244140625e-1,
  4.808979034423828125e-1,
].map(Math.fround)

function roundHalfAway(v) {
  return v < 0 ? -Math.floor(-v + 0.5) : Math.floor(v + 0.5)
}

function exp32(x0) {
  const x = Math.min(x0, Math.fround(88.723))
  const m = Math.floor(fma32(x, Math.fround(Math.LOG2E), 0.5))
  let r = fma32(m, -0.693359375, x)
  r = fma32(m, Math.fround(2.1219444e-4), r)
  const r2 = Math.fround(r * r)
  let even = fma32(r2, Math.fround(1.37449637986719608306884765625e-3), Math.fround(4.166965186595916748046875e-2))
  const odd = fma32(r2, Math.fround(8.36894474923610687255859375e-3), Math.fround(0.16666518151760101318359375))
  even = fma32(r2, even, Math.fround(0.49999988079071044921875))
  let y = fma32(r, odd, even)
  y = fma32(r2, y, Math.fround(r + 1))
  return Math.max(Math.fround(y * 2 ** m), x0)
}

// Float32 pow(x, y) with the extended-precision log2/exp2 algorithm of the
// vectorized float32 kernel that tf.pow uses, for finite inputs.
export function pow32(base, exponent) {
  const x = Math.fround(base)
  const y = Math.fround(exponent)
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return y === 0 || x === 1 ? 1 : NaN
  }
  if (y === 1) return x
  if (y === 0 || x === 1) return 1
  const yIsInt = Number.isInteger(y)
  const yIsOddInt = yIsInt && Math.abs(y % 2) === 1
  // TensorFlow flushes subnormal float32 values to zero.
  const minNormal = 1.1754943508222875e-38
  if (x === 0 || Math.abs(x) < minNormal) {
    const zero = y < 0 ? Infinity : 0
    return yIsOddInt && (x < 0 || Object.is(x, -0)) ? -zero : zero
  }
  if (x < 0 && !yIsInt) return NaN
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return Math.fround(Math.pow(x, y))
  }
  const xAbs = Math.abs(x)
  // frexp: mantissa in [0.5, 1).
  _f32Bits[0] = xAbs
  let e = ((_i32Bits[0] >>> 23) & 0xff) - 126
  _i32Bits[0] = (_i32Bits[0] & 0x007fffff) | 0x3f000000
  let m = _f32Bits[0]
  if (m < Math.fround(0.7071067811865476)) {
    m = Math.fround(2 * m)
    e -= 1
  }
  // log2(m) as a double word.
  const t = Math.fround(m - 1)
  let p = LOG2_POLY[0]
  for (let i = 1; i < LOG2_POLY.length; i++) p = fma32(p, t, LOG2_POLY[i])
  let [pHi, pLo] = twoProd32(t, p)
  ;[pHi, pLo] = dwFastTwoSum32(LOG2_C1_HI, LOG2_C1_LO, pHi, pLo)
  ;[pHi, pLo] = dwTwoProd32(pHi, pLo, t)
  ;[pHi, pLo] = dwFastTwoSum32(LOG2_C0_HI, LOG2_C0_LO, pHi, pLo)
  const [rxHi, rxLo] = dwTwoProd32(pHi, pLo, t)
  // y * log2(x) as a double word, split into integer and fraction.
  const [f1Hi, f1Lo] = twoProd32(e, y)
  const [f2Hi, f2Lo] = dwTwoProd32(rxHi, rxLo, y)
  const [fHi, fLo] = dwFastTwoSum32(f1Hi, f1Lo, f2Hi, f2Lo)
  let nz = roundHalfAway(fHi)
  let rz = Math.fround(Math.fround(fHi - nz) + fLo)
  const nr = roundHalfAway(rz)
  rz = Math.fround(rz - nr)
  nz += nr
  // exp2(rz) * 2^nz.
  const clamped = Math.max(Math.min(rz, 129), -151)
  const [eHi, eLo] = twoProd32(Math.fround(Math.LN2), clamped)
  const er = Math.fround(exp32(eHi) * Math.fround(1 + eLo))
  let result = Math.fround(er * 2 ** nz)
  if (result < minNormal) result = 0
  return x < 0 && yIsOddInt ? -result : result
}
