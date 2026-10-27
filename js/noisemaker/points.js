import { PointDistribution, ValueMask } from './constants.js'
import { Masks, maskShape } from './masks.js'
import { random as simplexRandom } from './simplex.js'
import { random as seededRandom, setSeed as setUtilSeed } from './util.js'

function isGrid(distrib) {
  return distrib >= PointDistribution.square && distrib < PointDistribution.spiral
}

function isCircular(distrib) {
  return distrib >= PointDistribution.circular
}

// The reference's % operator: the result takes the sign of the divisor.
function pyMod(value, divisor) {
  const mod = value % divisor
  if (mod === 0) return divisor < 0 ? -0 : 0
  return (mod < 0) !== (divisor < 0) ? mod + divisor : mod
}

// The reference keeps the points that still have generations to spawn in a
// Python set and takes them with set.pop(). The pop order is the order of
// CPython's hash table, and it decides which center each batch of random
// draws uses. PendingPoints stores (x, y, generation) tuples as CPython does:
// the numeric and tuple hashes, linear probing, reuse of deleted slots,
// resizing, and the search finger of set.pop().
const HASH_MODULUS = (1n << 61n) - 1n
const HASH_MASK64 = (1n << 64n) - 1n
const XXPRIME_1 = 11400714785074694791n
const XXPRIME_2 = 14029467366897019727n
const XXPRIME_5 = 2870177450012600261n
const PERTURB_SHIFT = 5n
const LINEAR_PROBES = 9
const SET_MIN_SIZE = 8
const DELETED = { deleted: true }
const hashView = new DataView(new ArrayBuffer(8))

// hash() of a finite float or int: |value| modulo 2**61 - 1, with its sign.
function pyHashNumber(value) {
  if (value === 0) return 0n
  hashView.setFloat64(0, Math.abs(value))
  const bits = hashView.getBigUint64(0)
  const biasedExponent = Number((bits >> 52n) & 0x7ffn)
  let mantissa = bits & ((1n << 52n) - 1n)
  let exponent = -1074
  if (biasedExponent !== 0) {
    mantissa |= 1n << 52n
    exponent = biasedExponent - 1075
  }
  // 2**61 is 1 modulo 2**61 - 1, so 2**exponent reduces to 2**(exponent mod 61).
  const shift = BigInt(((exponent % 61) + 61) % 61)
  let hash = ((mantissa % HASH_MODULUS) << shift) % HASH_MODULUS
  if (value < 0) hash = -hash
  return hash === -1n ? -2n : hash
}

// hash() of a tuple of numbers, as an unsigned 64-bit value.
function pyHashTuple(items) {
  let acc = XXPRIME_5
  for (const item of items) {
    const lane = BigInt.asUintN(64, pyHashNumber(item))
    acc = (acc + lane * XXPRIME_2) & HASH_MASK64
    acc = ((acc << 31n) | (acc >> 33n)) & HASH_MASK64
    acc = (acc * XXPRIME_1) & HASH_MASK64
  }
  acc = (acc + (BigInt(items.length) ^ (XXPRIME_5 ^ 3527539n))) & HASH_MASK64
  return acc === HASH_MASK64 ? 1546275796n : acc
}

class PendingPoints {
  constructor() {
    this.mask = SET_MIN_SIZE - 1
    this.table = new Array(SET_MIN_SIZE).fill(null)
    this.fill = 0
    this.used = 0
    this.finger = 0
  }

  get size() {
    return this.used
  }

  add(x, y, gen) {
    const key = [x, y, gen]
    const hash = pyHashTuple(key)
    const mask = this.mask
    let i = Number(hash & BigInt(mask))
    let perturb = hash
    let freeSlot = -1
    for (;;) {
      let probes = i + LINEAR_PROBES <= mask ? LINEAR_PROBES : 0
      let j = i
      do {
        const entry = this.table[j]
        if (entry === null) {
          if (freeSlot >= 0) {
            this.table[freeSlot] = { key, hash }
            this.used++
            return
          }
          this.table[j] = { key, hash }
          this.fill++
          this.used++
          if (this.fill * 5 >= mask * 3) {
            this.resize(this.used > 50000 ? this.used * 2 : this.used * 4)
          }
          return
        }
        if (entry === DELETED) {
          freeSlot = j
        } else if (
          entry.hash === hash &&
          entry.key[0] === x &&
          entry.key[1] === y &&
          entry.key[2] === gen
        ) {
          return
        }
        j++
      } while (probes--)
      perturb >>= PERTURB_SHIFT
      i = Number((BigInt(i) * 5n + 1n + perturb) & BigInt(mask))
    }
  }

  resize(minUsed) {
    let size = SET_MIN_SIZE
    while (size <= minUsed) size *= 2
    const old = this.table
    this.mask = size - 1
    this.table = new Array(size).fill(null)
    this.fill = this.used
    for (const entry of old) {
      if (entry !== null && entry !== DELETED) this.insertClean(entry)
    }
  }

  insertClean(entry) {
    const mask = this.mask
    let i = Number(entry.hash & BigInt(mask))
    let perturb = entry.hash
    for (;;) {
      if (this.table[i] === null) {
        this.table[i] = entry
        return
      }
      if (i + LINEAR_PROBES <= mask) {
        for (let j = i + 1; j <= i + LINEAR_PROBES; j++) {
          if (this.table[j] === null) {
            this.table[j] = entry
            return
          }
        }
      }
      perturb >>= PERTURB_SHIFT
      i = Number((BigInt(i) * 5n + 1n + perturb) & BigInt(mask))
    }
  }

  pop() {
    let i = this.finger & this.mask
    while (this.table[i] === null || this.table[i] === DELETED) {
      i = i === this.mask ? 0 : i + 1
    }
    const [x, y, gen] = this.table[i].key
    this.table[i] = DELETED
    this.used--
    this.finger = i + 1
    return { x, y, gen }
  }
}

export function pointCloud(
  freq,
  {
    distrib = PointDistribution.random,
    shape = null,
    corners = false,
    generations = 1,
    drift = 0,
    time = 0,
    speed = 1,
    seed,
  } = {}
) {
  if (!freq) return [[], []]

  if (seed !== undefined) setUtilSeed(seed)

  const x = []
  const y = []

  let width, height
  if (!shape) {
    width = 1
    height = 1
  } else {
    height = shape[0]
    width = shape[1]
  }

  if (typeof distrib === 'string') {
    if (PointDistribution[distrib] !== undefined) {
      distrib = PointDistribution[distrib]
    } else if (ValueMask[distrib] !== undefined) {
      distrib = ValueMask[distrib]
    }
  }

  const isMask = Object.values(ValueMask).includes(distrib)

  const rangeX = width * 0.5
  const rangeY = height * 0.5

  if (isMask) {
    const mask = Masks[distrib]
    const [maskHeight, maskWidth] = maskShape(distrib)
    const xSpace = width / maskWidth
    const ySpace = height / maskHeight
    const xMargin = xSpace * 0.5
    const yMargin = ySpace * 0.5

    for (let mx = 0; mx < maskWidth; mx++) {
      for (let my = 0; my < maskHeight; my++) {
        let pixel = mask[my][mx]
        if (Array.isArray(pixel)) pixel = pixel.reduce((a, b) => a + b, 0)

        let xDrift = 0
        let yDrift = 0
        if (drift) {
          xDrift = simplexRandom(time, undefined, speed) * drift / freq * width
          yDrift = simplexRandom(time, undefined, speed) * drift / freq * height
        }

        if (pixel !== 0) {
          x.push(Math.trunc(xMargin + mx * xSpace + xDrift))
          y.push(Math.trunc(yMargin + my * ySpace + yDrift))
        }
      }
    }

    return [x, y]
  }

  let pointFunc = rand
  const seen = new Set()
  const active = new PendingPoints()
  let startX = rangeY
  let startY = rangeX

  if (isGrid(distrib)) {
    pointFunc = squareGrid
    startX = 0
    startY = 0
  } else if (distrib === PointDistribution.spiral) {
    pointFunc = spiral
  } else if (isCircular(distrib)) {
    pointFunc = circular
  }
  active.add(startX, startY, 1)

  // Match Python's point_cloud behavior: the seen set holds the (x, y) of
  // the initial active point, so a generated point at those coordinates is
  // skipped, before any drift values are drawn.
  seen.add(`${startX},${startY}`)

  while (active.size) {
    const { x: cx, y: cy, gen } = active.pop()
    if (gen <= generations) {
      const multiplier = Math.max(2 * (gen - 1), 1)
      const [xs, ys] = pointFunc({
        freq,
        distrib,
        corners,
        centerX: cx,
        centerY: cy,
        rangeX: rangeX / multiplier,
        rangeY: rangeY / multiplier,
        width,
        height,
        generation: gen,
        time,
        speed: speed * 0.1,
      })

      for (let i = 0; i < xs.length; i++) {
        let xPoint = xs[i]
        let yPoint = ys[i]
        const key = `${xPoint},${yPoint}`
        if (seen.has(key)) continue
        seen.add(key)
        active.add(xPoint, yPoint, gen + 1)

        let xDrift = 0
        let yDrift = 0
        if (drift) {
          xDrift = simplexRandom(time, undefined, speed) * drift
          yDrift = simplexRandom(time, undefined, speed) * drift
        }

        if (!shape) {
          xPoint = pyMod(xPoint + xDrift / freq, 1)
          yPoint = pyMod(yPoint + yDrift / freq, 1)
        } else {
          xPoint = pyMod(Math.trunc(xPoint + (xDrift / freq * width)), width)
          yPoint = pyMod(Math.trunc(yPoint + (yDrift / freq * height)), height)
        }

        x.push(xPoint)
        y.push(yPoint)
      }
    }
  }

  return [x, y]
}

export function cloudPoints(count, { seed } = {}) {
  // RNG: count^2 * 2 calls via rand (x then y)
  return pointCloud(count, { distrib: PointDistribution.random, seed })
}

export function rand({
  freq = 2,
  centerX = 0.5,
  centerY = 0.5,
  rangeX = 0.5,
  rangeY = 0.5,
  width = 1,
  height = 1,
  seed,
} = {}) {
  if (seed !== undefined) setUtilSeed(seed)
  const x = []
  const y = []
  for (let i = 0; i < freq * freq; i++) {
    const _x = pyMod(centerX + (seededRandom() * (rangeX * 2) - rangeX), width) // RNG[x]
    const _y = pyMod(centerY + (seededRandom() * (rangeY * 2) - rangeY), height) // RNG[y]
    x.push(_x)
    y.push(_y)
  }
  return [x, y]
}

export function squareGrid({
  freq = 1,
  distrib = PointDistribution.square,
  corners = false,
  centerX = 0,
  centerY = 0,
  rangeX = 1,
  rangeY = 1,
  width = 1,
  height = 1,
} = {}) {
  const x = []
  const y = []
  const driftAmount = 0.5 / freq
  let drift
  if (freq % 2 === 0) {
    drift = corners ? driftAmount : 0
  } else {
    drift = corners ? 0 : driftAmount
  }

  for (let a = 0; a < freq; a++) {
    for (let b = 0; b < freq; b++) {
      if (distrib === PointDistribution.waffle && b % 2 === 0 && a % 2 === 0) continue
      if (distrib === PointDistribution.chess && a % 2 === b % 2) continue

      let xDrift = 0
      let yDrift = 0
      if (distrib === PointDistribution.h_hex) {
        xDrift = b % 2 === 1 ? driftAmount : 0
      }
      if (distrib === PointDistribution.v_hex) {
        yDrift = a % 2 === 1 ? 0 : driftAmount
      }

      const _x = pyMod(centerX + (((a / freq) + drift + xDrift) * rangeX * 2), width)
      const _y = pyMod(centerY + (((b / freq) + drift + yDrift) * rangeY * 2), height)
      x.push(_x)
      y.push(_y)
    }
  }
  return [x, y]
}

export function spiral({
  freq = 1,
  centerX = 0,
  centerY = 0,
  rangeX = 1,
  rangeY = 1,
  width = 1,
  height = 1,
  seed,
} = {}) {
  if (seed !== undefined) setUtilSeed(seed)
  const kink = 0.5 + seededRandom() * 0.5
  const x = []
  const y = []
  const count = freq * freq
  for (let i = 0; i < count; i++) {
    const fract = i / count
    const degrees = fract * 360 * (Math.PI / 180) * kink
    x.push(pyMod(centerX + Math.sin(degrees) * fract * rangeX, width))
    y.push(pyMod(centerY + Math.cos(degrees) * fract * rangeY, height))
  }
  return [x, y]
}

export function circular({
  freq = 1,
  distrib = PointDistribution.concentric,
  centerX = 0,
  centerY = 0,
  rangeX = 1,
  rangeY = 1,
  width = 1,
  height = 1,
  seed,
} = {}) {
  if (seed !== undefined) setUtilSeed(seed)
  const x = []
  const y = []
  const ringCount = freq
  const dotCount = freq
  x.push(centerX)
  y.push(centerY)
  const rotation = (1 / dotCount) * 360 * (Math.PI / 180)
  const kink = 0.5 + seededRandom() * 0.5
  for (let i = 1; i <= ringCount; i++) {
    const distFract = i / ringCount
    for (let j = 1; j <= dotCount; j++) {
      let rads = j * rotation
      if (distrib === PointDistribution.circular) {
        rads += rotation * 0.5 * i
      }
      if (distrib === PointDistribution.rotating) {
        rads += rotation * distFract * kink
      }
      const xPoint = centerX + Math.sin(rads) * distFract * rangeX
      const yPoint = centerY + Math.cos(rads) * distFract * rangeY
      x.push(pyMod(xPoint, width))
      y.push(pyMod(yPoint, height))
    }
  }
  return [x, y]
}
