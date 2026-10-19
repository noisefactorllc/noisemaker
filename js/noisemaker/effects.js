import { Tensor, markPresentationNormalized } from "./tensor.js"
import { register } from "./effectsRegistry.js"
import { ColorSpace, OctaveBlending } from "./constants.js"
import {
  normalize,
  blend,
  values,
  freqForShape,
  adjustHue,
  distance,
  clamp01,
  rgbToHsv,
  hsvToRgb,
  ridge,
  resample,
  proportionalDownsample,
  upsample,
  refract as refractOp,
  toValueMap,
  convolution,
  fxaa,
} from "./value.js"
import { cos32, packetEnd, pow32, sin32 } from "./float32.js"
import { PALETTES } from "../../shaders/src/palettes.js"
import {
  simplex,
  random as simplexRandom,
} from "./simplex.js"
import { getAtlas, maskValues, maskShape } from "./masks.js"
import { loadGlyphs } from "./glyphs.js"
import {
  random,
  randomInt,
  uniform as randomUniform,
  normal as randomNormalArray,
  getBaseSeed,
  fromSRGB,
  toSRGB,
  withTensorData,
  withTensorDatas,
} from "./util.js"
import {
  randomInt as rngRandomInt,
} from "./rng.js"
import { pointCloud } from "./points.js"
import { rgbToOklab } from "./oklab.js"
import {
  InterpolationType,
  DistanceMetric,
  ValueMask,
  ValueDistribution,
  PointDistribution,
  VoronoiDiagramType,
  WormBehavior,
  gridMembers,
} from "./constants.js"

const rippleReferenceCacheByContext = new WeakMap()
const rippleReferenceCacheForNullContext = new Map()
const rippleRandomSeedCacheByContext = new WeakMap()
const rippleRandomSeedCacheForNullContext = new Map()

function getRippleReferenceCache(ctx) {
  if (ctx && typeof ctx === "object") {
    let cache = rippleReferenceCacheByContext.get(ctx)
    if (!cache) {
      cache = new Map()
      rippleReferenceCacheByContext.set(ctx, cache)
    }
    return cache
  }
  return rippleReferenceCacheForNullContext
}

function getRippleRandomSeedCache(ctx) {
  if (ctx && typeof ctx === "object") {
    let cache = rippleRandomSeedCacheByContext.get(ctx)
    if (!cache) {
      cache = new Map()
      rippleRandomSeedCacheByContext.set(ctx, cache)
    }
    return cache
  }
  return rippleRandomSeedCacheForNullContext
}

function rippleReferenceCacheKey(freq, height, width, splineOrder) {
  const freqKey = Array.isArray(freq)
    ? freq.map((v) => `${v}`).join("x")
    : `${freq}`
  return `${height}x${width}|${freqKey}|${splineOrder}`
}

async function screenBlend(base, leak, shape) {
  const baseDataMaybe = base.read()
  const leakDataMaybe = leak.read()
  const [baseData, leakData] = await Promise.all([baseDataMaybe, leakDataMaybe])
  const out = new Float32Array(baseData.length)
  for (let i = 0; i < baseData.length; i++) {
    const a = baseData[i]
    const b = leakData[i]
    out[i] = Math.fround(1 - (1 - a) * (1 - b))
  }
  return Tensor.fromArray(base.ctx, out, shape)
}

async function scaleTensor(tensor, factor) {
  if (!(tensor instanceof Tensor)) {
    return tensor
  }
  const shape = tensor.shape
  return withTensorData(tensor, (src) => {
    const dest = new Tensor(tensor.ctx, null, shape)
    const out = dest.data
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.fround((src[i] ?? 0) * factor)
    }
    return dest
  })
}

let multiresGeneratorPromise = null

async function loadMultiresGenerator() {
  if (!multiresGeneratorPromise) {
    multiresGeneratorPromise = import("./generators.js").then((mod) => {
      if (!mod || typeof mod.multires !== "function") {
        throw new Error("Failed to load multires generator implementation")
      }
      return mod.multires
    })
  }
  return multiresGeneratorPromise
}

async function multiresEffect(
  tensor,
  shape,
  time,
  speed,
  freqX = 3,
  freqY = 3,
  octaves = 1,
  ridges = 0,
  sinAmount = 0,
  latticeDrift = 0,
  colorSpace = ColorSpace.hsv,
  hueRange = 0.125,
  hueRotation = 0,
  saturation = 1,
  octaveBlend = OctaveBlending.falloff,
) {
  if (!(tensor instanceof Tensor)) {
    throw new Error("multires effect expects a tensor input")
  }

  const ctx = tensor.ctx
  const targetShape = Array.isArray(shape) && shape.length
    ? shape
    : tensor.shape

  if (!Array.isArray(targetShape) || targetShape.length < 2) {
    throw new Error("multires effect requires a valid tensor shape")
  }

  const resolveFrequencyComponent = (value, fallback) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return fallback
    }
    return Math.max(1, Math.round(numeric))
  }

  const frequency = [
    resolveFrequencyComponent(freqX, 3),
    resolveFrequencyComponent(freqY, resolveFrequencyComponent(freqX, 3)),
  ]

  const resolveBoolean = (value) => Math.round(Number(value) || 0) !== 0

  const resolveNumber = (value, fallback = 0) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
  }

  const resolvePositive = (value, fallback = 0) => {
    const numeric = resolveNumber(value, fallback)
    return numeric < 0 ? 0 : numeric
  }

  const resolveUnitInterval = (value, fallback = 0) => {
    const numeric = resolveNumber(value, fallback)
    if (!Number.isFinite(numeric)) {
      return fallback
    }
    if (numeric < 0) {
      return 0
    }
    if (numeric > 1) {
      return 1
    }
    return numeric
  }

  const resolvedOctaves = Math.max(1, Math.round(resolveNumber(octaves, 1)))
  const resolvedColorSpace = (() => {
    const numeric = Math.round(resolveNumber(colorSpace, ColorSpace.hsv))
    switch (numeric) {
      case ColorSpace.grayscale:
      case ColorSpace.rgb:
      case ColorSpace.hsv:
      case ColorSpace.oklab:
        return numeric
      default:
        return ColorSpace.hsv
    }
  })()

  const resolvedOctaveBlend = (() => {
    const numeric = Math.round(resolveNumber(octaveBlend, OctaveBlending.falloff))
    switch (numeric) {
      case OctaveBlending.reduce_max:
      case OctaveBlending.alpha:
        return numeric
      default:
        return OctaveBlending.falloff
    }
  })()

  const resolvedHueRotation = (() => {
    const numeric = resolveNumber(hueRotation, 0)
    if (!Number.isFinite(numeric)) {
      return 0
    }
    const wrapped = numeric - Math.floor(numeric)
    return wrapped < 0 ? wrapped + 1 : wrapped
  })()

  const options = {
    ctx,
    octaves: resolvedOctaves,
    ridges: resolveBoolean(ridges),
    sin: resolveNumber(sinAmount, 0),
    latticeDrift: resolveNumber(latticeDrift, 0),
    color_space: resolvedColorSpace,
    hueRange: resolveUnitInterval(hueRange, 0.125),
    hueRotation: resolvedHueRotation,
    saturation: resolvePositive(saturation, 1),
    octaveBlending: resolvedOctaveBlend,
    time: resolveNumber(time, 0),
    speed: resolveNumber(speed, 0),
  }

  const multiresGenerator = await loadMultiresGenerator()
  return multiresGenerator(frequency, targetShape, options)
}


async function prepareWarpMap(
  warpMap,
  shape,
  ctx,
  splineOrder = InterpolationType.bicubic,
) {
  if (warpMap === null || warpMap === undefined) {
    return null
  }
  const [h, w] = shape
  let mapTensor = warpMap
  if (mapTensor && typeof mapTensor.then === "function") {
    mapTensor = await mapTensor
  }
  if (!(mapTensor instanceof Tensor)) {
    let arr
    if (ArrayBuffer.isView(mapTensor)) {
      const view = mapTensor
      let scale = 1
      if (view instanceof Uint8Array || view instanceof Uint8ClampedArray) {
        scale = 1 / 255
      } else if (view instanceof Uint16Array) {
        scale = 1 / 65535
      }
      arr = new Float32Array(view.length)
      for (let i = 0; i < view.length; i++) {
        arr[i] = Math.fround(view[i] * scale)
      }
    } else if (Array.isArray(mapTensor)) {
      arr = new Float32Array(mapTensor.length)
      for (let i = 0; i < mapTensor.length; i++) {
        arr[i] = Math.fround(mapTensor[i] ?? 0)
      }
    } else {
      throw new Error("warp: warpMap must be a Tensor or array-like object")
    }
    const base = h * w
    if (!base || arr.length % base !== 0) {
      throw new Error(
        "warp: warpMap array size must be a multiple of the image dimensions",
      )
    }
    const channels = arr.length / base
    mapTensor = Tensor.fromArray(ctx, arr, [h, w, channels])
  }
  if (mapTensor.shape[0] !== h || mapTensor.shape[1] !== w) {
    const channels = mapTensor.shape[2] || 1
    mapTensor = await resample(
      mapTensor,
      [h, w, channels],
      splineOrder,
    )
  }
  return mapTensor
}

export async function warp(
  tensor,
  shape,
  time,
  speed,
  freq = 2,
  octaves = 5,
  displacement = 1,
  splineOrder = InterpolationType.bicubic,
  warpMap = null,
  signedRange = true,
) {
  const [h, w] = shape
  const ctx = tensor.ctx

  // Resolve freq if it's an array of functions or other non-numeric values
  let resolvedFreq = freq
  if (Array.isArray(freq)) {
    resolvedFreq = freq.map(f => {
      // If it's a function, it's probably an unresolved preset value
      if (typeof f === 'function') {
        throw new Error(
          "Unresolved frequency function in warp. Frequency values must be resolved to numbers before calling warp.",
        )
      }
      if (!Number.isFinite(f) || f <= 0) {
        throw new Error(`Invalid frequency value: ${f}. Frequency must be a positive finite number.`)
      }
      return f
    })
  } else if (typeof freq === 'function') {
    throw new Error(
      "Unresolved frequency function in warp. Frequency value must be resolved to a number before calling warp.",
    )
  } else if (!Number.isFinite(freq) || freq <= 0) {
    throw new Error(`Invalid frequency value: ${freq}. Frequency must be a positive finite number.`)
  }

  const baseFreq = Array.isArray(resolvedFreq)
    ? resolvedFreq
    : freqForShape(resolvedFreq, shape)
  const warpTensor = await prepareWarpMap(warpMap, [h, w], ctx, splineOrder)
  let out = tensor
  for (let octave = 1; octave <= octaves; octave++) {
    const mult = 2 ** octave
    const f = [
      Math.floor(baseFreq[0] * 0.5 * mult),
      Math.floor(baseFreq[1] * 0.5 * mult),
    ]

    // Validate calculated frequencies to prevent NaN issues
    if (!Number.isFinite(f[0]) || f[0] <= 0 || !Number.isFinite(f[1]) || f[1] <= 0) {
      throw new Error(
        `Invalid calculated frequency values in warp: f=[${f[0]}, ${f[1]}] from baseFreq=[${baseFreq[0]}, ${baseFreq[1]}], mult=${mult}. All values must be positive finite numbers.`,
      )
    }

    if (f[0] >= h || f[1] >= w) break
    if (warpTensor) {
      out = await refractEffect(
        out,
        shape,
        time,
        speed,
        displacement / mult,
        warpTensor,
        null,
        null,
        splineOrder,
        false,
        signedRange,
      )
    } else {
      const opts = { ctx, time, speed, splineOrder }
      const [flowX, flowY] = await Promise.all([
        values(f, [h, w, 1], opts),
        values(f, [h, w, 1], opts),
      ])
      out = await refractEffect(
        out,
        shape,
        time,
        speed,
        displacement / mult,
        flowX,
        flowY,
        null,
        splineOrder,
        false,
        signedRange,
      )
    }
  }
  return out
}

register("multires", multiresEffect, {
  freqX: 3,
  freqY: 3,
  octaves: 1,
  ridges: 0,
  sinAmount: 0,
  latticeDrift: 0,
  colorSpace: ColorSpace.hsv,
  hueRange: 0.125,
  hueRotation: 0,
  saturation: 1,
  octaveBlend: OctaveBlending.falloff,
})

register("warp", warp, {
  freq: 2,
  octaves: 5,
  displacement: 1,
  splineOrder: InterpolationType.bicubic,
  warpMap: null,
  signedRange: true,
})

export async function shadow(
  tensor,
  shape,
  time,
  speed,
  alpha = 1,
  reference = null,
) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  let refCandidate = reference ?? tensor
  if (refCandidate && typeof refCandidate.then === "function") {
    refCandidate = await refCandidate
  }
  // GPU implementation removed; CPU path below handles shading.
  let ref = refCandidate || tensor
  ref = await toValueMap(ref)
  const valueShape = [h, w, 1]
  if (ref.shape[0] !== h || ref.shape[1] !== w) {
    ref = await resample(ref, valueShape)
  }
  ref = await normalize(ref)
  const [sobelXTensor, sobelYTensor] = await Promise.all([
    convolve(
      ref,
      valueShape,
      time,
      speed,
      ValueMask.conv2d_sobel_x,
      true,
      1,
    ),
    convolve(
      ref,
      valueShape,
      time,
      speed,
      ValueMask.conv2d_sobel_y,
      true,
      1,
    ),
  ])
  let shade = await withTensorDatas(
    [sobelXTensor, sobelYTensor],
    (sobelXData, sobelYData) => {
      const distData = new Float32Array(h * w)
      for (let i = 0; i < h * w; i++) {
        distData[i] = distance(
          sobelXData[i],
          sobelYData[i],
          DistanceMetric.euclidean,
        )
      }
      return Tensor.fromArray(ctx, distData, valueShape)
    },
  )
  shade = await normalize(shade)
  shade = await convolve(
    shade,
    valueShape,
    time,
    speed,
    ValueMask.conv2d_sharpen,
    true,
    0.5,
  )
  const shadeDataMaybe = shade.read()
  const shadeData =
    shadeDataMaybe && typeof shadeDataMaybe.then === "function"
      ? await shadeDataMaybe
      : shadeDataMaybe
  const highlight = new Float32Array(h * w)
  for (let i = 0; i < h * w; i++) {
    highlight[i] = Math.fround(shadeData[i] * shadeData[i])
  }
  const srcMaybe = tensor.read()
  const srcData =
    srcMaybe && typeof srcMaybe.then === "function" ? await srcMaybe : srcMaybe
  const shadedData = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const sh = shadeData[i]
    const hi = highlight[i]
    for (let k = 0; k < c; k++) {
      const idx = i * c + k
      const val = srcData[idx]
      const dark = Math.fround((1 - val) * (1 - hi))
      const lit = Math.fround(1 - dark)
      const shaded = Math.fround(lit * sh)
      shadedData[idx] = Math.min(1, Math.max(0, shaded))
    }
  }
  const shadedTensor = Tensor.fromArray(ctx, shadedData, shape)
  if (c === 1) {
    return blend(tensor, shadedTensor, alpha)
  }
  if (c === 2) {
    const out = srcData.slice()
    let alphaVals = null
    let alphaChannels = 0
    if (alpha && typeof alpha === "object") {
      let alphaTensor = alpha
      if (alphaTensor && typeof alphaTensor.then === "function") {
        alphaTensor = await alphaTensor
      }
      if (alphaTensor && typeof alphaTensor.read === "function") {
        const alphaMaybe = alphaTensor.read()
        alphaVals =
          alphaMaybe && typeof alphaMaybe.then === "function"
            ? await alphaMaybe
            : alphaMaybe
        alphaChannels = alphaTensor.shape[2] || 1
      }
    }
    for (let i = 0; i < h * w; i++) {
      const tVal =
        alphaVals && alphaChannels
          ? alphaVals[i * alphaChannels]
          : alpha
      const shadeVal = shadedData[i * c]
      out[i * 2] = Math.fround(
        (1 - tVal) * srcData[i * 2] + tVal * shadeVal,
      )
    }
    return Tensor.fromArray(ctx, out, shape)
  }
  let rgbTensor
  let alphaChannel = null
  if (c === 4) {
    const rgbData = new Float32Array(h * w * 3)
    alphaChannel = new Float32Array(h * w)
    for (let i = 0; i < h * w; i++) {
      const base = i * 4
      const base3 = i * 3
      rgbData[base3] = srcData[base]
      rgbData[base3 + 1] = srcData[base + 1]
      rgbData[base3 + 2] = srcData[base + 2]
      alphaChannel[i] = srcData[base]
    }
    rgbTensor = Tensor.fromArray(ctx, rgbData, [h, w, 3])
  } else {
    rgbTensor = tensor
  }
  const shadeRgb = new Float32Array(h * w * 3)
  for (let i = 0; i < h * w; i++) {
    const base = i * c
    const base3 = i * 3
    shadeRgb[base3] = shadedData[base]
    shadeRgb[base3 + 1] = shadedData[base + Math.min(1, c - 1)]
    shadeRgb[base3 + 2] = shadedData[base + Math.min(2, c - 1)]
  }
  let hsvTensor = rgbToHsv(rgbTensor)
  if (hsvTensor && typeof hsvTensor.then === "function") {
    hsvTensor = await hsvTensor
  }
  let shadeHsvTensor = rgbToHsv(
    Tensor.fromArray(ctx, shadeRgb, [h, w, 3]),
  )
  if (shadeHsvTensor && typeof shadeHsvTensor.then === "function") {
    shadeHsvTensor = await shadeHsvTensor
  }
  const hsvDataMaybe = hsvTensor.read()
  const hsvData =
    hsvDataMaybe && typeof hsvDataMaybe.then === "function"
      ? await hsvDataMaybe
      : hsvDataMaybe
  const shadeHsvDataMaybe = shadeHsvTensor.read()
  const shadeHsvData =
    shadeHsvDataMaybe && typeof shadeHsvDataMaybe.then === "function"
      ? await shadeHsvDataMaybe
      : shadeHsvDataMaybe
  let alphaVals = null
  let alphaChannels = 0
  if (alpha && typeof alpha === "object") {
    let alphaTensor = alpha
    if (alphaTensor && typeof alphaTensor.then === "function") {
      alphaTensor = await alphaTensor
    }
    if (alphaTensor && typeof alphaTensor.read === "function") {
      const alphaMaybe = alphaTensor.read()
      alphaVals =
        alphaMaybe && typeof alphaMaybe.then === "function"
          ? await alphaMaybe
          : alphaMaybe
      alphaChannels = alphaTensor.shape[2] || 1
    }
  }
  for (let i = 0; i < h * w; i++) {
    const tVal =
      alphaVals && alphaChannels ? alphaVals[i * alphaChannels] : alpha
    hsvData[i * 3 + 2] = Math.fround(
      (1 - tVal) * hsvData[i * 3 + 2] + tVal * shadeHsvData[i * 3 + 2],
    )
  }
  let result = hsvToRgb(Tensor.fromArray(ctx, hsvData, [h, w, 3]))
  if (result && typeof result.then === "function") {
    result = await result
  }
  if (c === 4) {
    const resDataMaybe = result.read()
    const resData =
      resDataMaybe && typeof resDataMaybe.then === "function"
        ? await resDataMaybe
        : resDataMaybe
    const out = new Float32Array(h * w * 4)
    for (let i = 0; i < h * w; i++) {
      const base = i * 4
      const base3 = i * 3
      out[base] = resData[base3]
      out[base + 1] = resData[base3 + 1]
      out[base + 2] = resData[base3 + 2]
      out[base + 3] = alphaChannel[i]
    }
    return Tensor.fromArray(ctx, out, shape)
  }
  return result
}
register("shadow", shadow, { alpha: 1, reference: null })

export async function bloom(tensor, shape, time, speed, alpha = 0.5) {
  const [h, w] = shape
  const resolveChannels = (value) =>
    Number.isFinite(value) && value > 0 ? Math.floor(value) : null
  const channelCount =
    resolveChannels(shape?.[2]) ?? resolveChannels(tensor.shape?.[2]) ?? 1
  const fullShape = [h, w, channelCount]
  const alphaVal = Number.isFinite(alpha) ? alpha : 0.5
  const xOffset = Math.trunc(w * -0.05)
  const yOffset = Math.trunc(h * -0.05)

  const src = await tensor.read()
  const bright = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) {
    let v = src[i] * 2 - 1
    if (v < 0) v = 0
    if (v > 1) v = 1
    bright[i] = v
  }

  let blurred = Tensor.fromArray(tensor.ctx, bright, fullShape)
  const targetShape = [
    Math.max(1, Math.floor(h / 100)),
    Math.max(1, Math.floor(w / 100)),
    channelCount,
  ]
  blurred = await proportionalDownsample(blurred, fullShape, targetShape)
  const blurredData = await blurred.read()
  for (let i = 0; i < blurredData.length; i++) {
    blurredData[i] *= 4
  }
  blurred = Tensor.fromArray(tensor.ctx, blurredData, targetShape)
  blurred = await resample(blurred, fullShape)
  blurred = await offsetTensor(blurred, xOffset, yOffset)
  blurred = await adjustBrightness(blurred, fullShape, time, speed, 0.25)

  // Contrast stretch about the per-channel mean, as the Python reference
  // computes it here with tf.reduce_mean rather than tf.image.adjust_contrast.
  const blurredFull = await blurred.read()
  const pixelCount = h * w
  const mean = new Float32Array(channelCount)
  for (let i = 0; i < pixelCount; i++) {
    for (let ch = 0; ch < channelCount; ch++) {
      mean[ch] = Math.fround(mean[ch] + blurredFull[i * channelCount + ch])
    }
  }
  for (let ch = 0; ch < channelCount; ch++) {
    mean[ch] = Math.fround(mean[ch] / pixelCount)
  }
  for (let i = 0; i < pixelCount; i++) {
    for (let ch = 0; ch < channelCount; ch++) {
      const idx = i * channelCount + ch
      const m = mean[ch]
      // Separate float32 subtract, multiply and add, as the reference's ops.
      const v = Math.fround(
        Math.fround(Math.fround(blurredFull[idx] - m) * 1.5) + m,
      )
      blurredFull[idx] = v < 0 ? 0 : v > 1 ? 1 : v
    }
  }
  const mixData = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) {
    mixData[i] = (src[i] + blurredFull[i]) * 0.5
  }
  const mixedTensor = Tensor.fromArray(tensor.ctx, mixData, fullShape)
  const [baseClamped, mixedClamped] = await Promise.all([
    clamp01(tensor),
    clamp01(mixedTensor),
  ])
  return blend(baseClamped, mixedClamped, alphaVal)
}
register("bloom", bloom, { alpha: 0.5 })

export function derivative(
  tensor,
  shape,
  time,
  speed,
  distMetric = DistanceMetric.euclidean,
  withNormalize = true,
  alpha = 1,
) {
  const [h, w, c] = shape
  // Python expands each derivative kernel through mask_values(), which
  // consumes one RNG seed even though these masks are static.
  randomInt(1, 65536)
  randomInt(1, 65536)
  const kx = [
    [0, 0, 0],
    [0, 1, -1],
    [0, 0, 0],
  ]
  const ky = [
    [0, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ]
  const dx = convolution(tensor, kx, { normalize: false })
  const dy = convolution(tensor, ky, { normalize: false })
  const compute = (dxData, dyData) => {
    const out = new Float32Array(h * w * c)
    for (let i = 0; i < out.length; i++) {
      out[i] = distance(dxData[i], dyData[i], distMetric)
    }
    let result = Tensor.fromArray(tensor.ctx, out, shape)
    if (withNormalize) result = normalize(result)
    if (alpha !== 1) result = blend(tensor, result, alpha)
    return result
  }
  const handle = (dxT, dyT) => withTensorDatas([dxT, dyT], compute)
  if (
    (dx && typeof dx.then === "function") ||
    (dy && typeof dy.then === "function")
  ) {
    return Promise.all([dx, dy]).then(([dxx, dyy]) => handle(dxx, dyy))
  }
  return handle(dx, dy)
}
register("derivative", derivative, {
  distMetric: DistanceMetric.euclidean,
  withNormalize: true,
  alpha: 1,
})

export async function sobelOperator(
  tensor,
  shape,
  time,
  speed,
  distMetric = DistanceMetric.euclidean,
) {
  const [h, w, c] = shape
  const blurKernel = [
    [1, 4, 6, 4, 1],
    [4, 16, 24, 16, 4],
    [6, 24, 36, 24, 6],
    [4, 16, 24, 16, 4],
    [1, 4, 6, 4, 1],
  ].map((row) => row.map((v) => Math.fround(v / 36)))
  const sobelXKernel = [
    [1, 0, -1],
    [2, 0, -2],
    [1, 0, -1],
  ].map((row) => row.map((v) => Math.fround(v / 2)))
  const sobelYKernel = [
    [1, 2, 1],
    [0, 0, 0],
    [-1, -2, -1],
  ].map((row) => row.map((v) => Math.fround(v / 2)))
  // GPU path removed; CPU implementation follows.
  const convolveAndProcess = async (blurred) => {
    const gx = await convolution(blurred, sobelXKernel, { normalize: false })
    const gy = await convolution(blurred, sobelYKernel, { normalize: false })

    const gradient = await withTensorDatas([gx, gy], (gxData, gyData) => {
      const grad = new Float32Array(gxData.length)
      for (let i = 0; i < grad.length; i++) {
        grad[i] = Math.fround(distance(gxData[i], gyData[i], distMetric))
      }
      return Tensor.fromArray(tensor.ctx, grad, shape)
    })

    const normalized = await normalize(gradient)
    const processed = await withTensorData(normalized, (data) => {
      const out = new Float32Array(data.length)
      for (let i = 0; i < data.length; i++) {
        const doubled = Math.fround(data[i] * 2)
        const centered = Math.fround(doubled - 1)
        out[i] = Math.fround(Math.abs(centered))
      }
      const ctxOut = (normalized && normalized.ctx) || tensor.ctx
      return Tensor.fromArray(ctxOut, out, shape)
    })

    return offsetTensor(processed, -1, -1)
  }

  const blurred = await convolution(tensor, blurKernel)
  return convolveAndProcess(blurred)
}
register("sobel_operator", sobelOperator, {
  distMetric: DistanceMetric.euclidean,
})

export async function sobel(
  tensor,
  shape,
  time,
  speed,
  distMetric = DistanceMetric.euclidean,
  rgb = false,
  alpha = 1,
) {
  if (rgb) {
    let out = await sobelOperator(tensor, shape, time, speed, distMetric)
    if (alpha !== 1) {
      out = await blend(tensor, out, alpha)
    }
    return out
  }

  let out = await outline(tensor, shape, time, speed, distMetric, true)
  out = await invert(out, shape, time, speed)
  if (alpha !== 1) {
    out = await blend(tensor, out, alpha)
  }
  return out
}
register("sobel", sobel, {
  distMetric: DistanceMetric.euclidean,
  rgb: false,
  alpha: 1,
})

export async function outline(
  tensor,
  shape,
  time,
  speed,
  sobelMetric = DistanceMetric.euclidean,
  invert = false,
) {
  const [h, w, c] = shape
  // GPU path removed; CPU implementation only.

  const valueShape = [h, w, 1]
  let values = await toValueMap(tensor)
  if (
    values.shape[0] !== h ||
    values.shape[1] !== w ||
    values.shape[2] !== 1
  ) {
    values = await resample(values, valueShape)
    if (values.shape[2] !== 1) {
      values = await toValueMap(values)
    }
  }
  values = await normalize(values)
  const edgesTensor = await sobelOperator(
    values,
    valueShape,
    time,
    speed,
    sobelMetric,
  )
  const [edgeDataMaybe, srcDataMaybe] = await Promise.all([
    edgesTensor.read(),
    tensor.read(),
  ])
  const edgeData =
    edgeDataMaybe instanceof Float32Array
      ? edgeDataMaybe
      : Float32Array.from(edgeDataMaybe || [])
  const srcData =
    srcDataMaybe instanceof Float32Array
      ? srcDataMaybe
      : Float32Array.from(srcDataMaybe || [])
  const out = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const edgeVal = Math.fround(edgeData[i] ?? 0)
    const eVal = invert ? Math.fround(1 - edgeVal) : edgeVal
    for (let k = 0; k < c; k++) {
      const base = i * c + k
      const srcVal = Math.fround(srcData[base] ?? 0)
      out[base] = Math.fround(srcVal * eVal)
    }
  }
  return Tensor.fromArray(tensor.ctx, out, [h, w, c])
}
register("outline", outline, {
  sobelMetric: DistanceMetric.euclidean,
  invert: false,
})

export async function glowingEdges(
  tensor,
  shape,
  time,
  speed,
  sobelMetric = DistanceMetric.manhattan,
  alpha = 1,
) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const metric = sobelMetric ?? DistanceMetric.manhattan

  const valueShape = [h, w, 1]
  const srcMaybe = tensor.read()
  const src =
    srcMaybe && typeof srcMaybe.then === "function"
      ? await srcMaybe
      : srcMaybe

  let edges = await toValueMap(tensor)
  if (edges.shape[0] !== h || edges.shape[1] !== w) {
    edges = await resample(edges, valueShape)
  }
  edges = await normalize(edges)
  const levels = randomInt(3, 5)
  edges = await posterize(edges, valueShape, time, speed, levels)
  edges = await sobelOperator(edges, valueShape, time, speed, metric)
  const sobelDataMaybe = edges.read()
  const sobelData =
    sobelDataMaybe && typeof sobelDataMaybe.then === "function"
      ? await sobelDataMaybe
      : sobelDataMaybe
  const inverted = new Float32Array(h * w)
  for (let i = 0; i < h * w; i++) {
    inverted[i] = Math.fround(1 - sobelData[i])
  }
  let edgeTensor = Tensor.fromArray(ctx, inverted, valueShape)

  const srcData =
    src instanceof Float32Array ? src : Float32Array.from(src || [])
  const multiplied = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const eVal = Math.min(inverted[i] * 8, 1)
    const base = i * c
    for (let k = 0; k < c; k++) {
      const tVal = Math.min(srcData[base + k] * 1.25, 1)
      multiplied[base + k] = Math.fround(eVal * tVal)
    }
  }
  edgeTensor = Tensor.fromArray(ctx, multiplied, shape)
  edgeTensor = await bloom(edgeTensor, shape, time, speed, 0.5)

  const blurTensor = maskValues(ValueMask.conv2d_blur)[0]
  const [bh, bw] = maskShape(ValueMask.conv2d_blur)
  const blurFlatMaybe = blurTensor.read()
  const blurFlat =
    blurFlatMaybe && typeof blurFlatMaybe.then === "function"
      ? await blurFlatMaybe
      : blurFlatMaybe
  const blurKernel = []
  for (let y = 0; y < bh; y++) {
    const row = []
    for (let x = 0; x < bw; x++) {
      row.push(blurFlat[y * bw + x])
    }
    blurKernel.push(row)
  }
  const blurred = await convolution(edgeTensor, blurKernel)
  const edgeDataMaybe = edgeTensor.read()
  const blurredDataMaybe = blurred.read()
  const edgeData =
    edgeDataMaybe && typeof edgeDataMaybe.then === "function"
      ? await edgeDataMaybe
      : edgeDataMaybe
  const blurredData =
    blurredDataMaybe && typeof blurredDataMaybe.then === "function"
      ? await blurredDataMaybe
      : blurredDataMaybe
  const sum = new Float32Array(edgeData.length)
  for (let i = 0; i < sum.length; i++) {
    sum[i] = Math.fround(edgeData[i] + blurredData[i])
  }
  edgeTensor = Tensor.fromArray(ctx, sum, shape)
  edgeTensor = await normalize(edgeTensor)
  const normalizedMaybe = edgeTensor.read()
  const normalized =
    normalizedMaybe && typeof normalizedMaybe.then === "function"
      ? await normalizedMaybe
      : normalizedMaybe
  const final = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const base = i * c
    for (let k = 0; k < c; k++) {
      const edgeVal = normalized[base + k]
      const srcVal = srcData[base + k]
      final[base + k] = Math.fround(1 - (1 - edgeVal) * (1 - srcVal))
    }
  }
  let result = Tensor.fromArray(ctx, final, shape)
  if (alpha !== 1) {
    result = await blend(tensor, result, alpha)
  }
  return result
}
register("glowing_edges", glowingEdges, {
  sobelMetric: DistanceMetric.manhattan,
  alpha: 1,
})

export async function normalMap(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const valueShape = [h, w, 1]
  let reference = await toValueMap(tensor)
  reference = await normalize(reference)
  const sobelX = await convolve(
    reference,
    valueShape,
    time,
    speed,
    ValueMask.conv2d_sobel_x
  )
  const sobelY = await convolve(
    reference,
    valueShape,
    time,
    speed,
    ValueMask.conv2d_sobel_y
  )
  const oneMinusX = await withTensorData(sobelX, (data) => {
    const out = new Float32Array(data.length)
    for (let i = 0; i < data.length; i++) {
      out[i] = Math.fround(1 - (data[i] ?? 0))
    }
    return Tensor.fromArray(sobelX.ctx, out, sobelX.shape)
  })
  const [xTensor, yTensor] = await Promise.all([
    normalize(oneMinusX),
    normalize(sobelY),
  ])
  const [xData, yData] = await Promise.all([xTensor.read(), yTensor.read()])
  const xArr =
    xData instanceof Float32Array
      ? xData
      : Float32Array.from(xData ?? [])
  const yArr =
    yData instanceof Float32Array
      ? yData
      : Float32Array.from(yData ?? [])
  const mag = new Float32Array(h * w)
  for (let i = 0; i < h * w; i++) {
    const xi = Math.fround(xArr[i] ?? 0)
    const yi = Math.fround(yArr[i] ?? 0)
    const sum = Math.fround(Math.fround(xi * xi) + Math.fround(yi * yi))
    mag[i] = Math.fround(Math.sqrt(sum))
  }
  const zTensor = await normalize(
    Tensor.fromArray(tensor.ctx, mag, [h, w, 1]),
  )
  const zData = await zTensor.read()
  const zArr =
    zData instanceof Float32Array
      ? zData
      : Float32Array.from(zData ?? [])
  const out = new Float32Array(h * w * 3)
  for (let i = 0; i < h * w; i++) {
    const xi = Math.fround(xArr[i] ?? 0)
    const yi = Math.fround(yArr[i] ?? 0)
    const zi = Math.fround(zArr[i] ?? 0)
    const twoZ = Math.fround(Math.fround(zi * 2) - 1)
    const z = Math.fround(1 - Math.abs(twoZ) * 0.5 + 0.5)
    out[i * 3] = xi
    out[i * 3 + 1] = yi
    out[i * 3 + 2] = z
  }
  return Tensor.fromArray(tensor.ctx, out, [h, w, 3])
}
register("normal_map", normalMap, {})

export async function voronoi(
  tensor,
  shape,
  time,
  speed,
  diagramType = VoronoiDiagramType.range,
  nth = 0,
  distMetric = DistanceMetric.euclidean,
  sdfSides = 3,
  alpha = 1,
  withRefract = 0,
  inverse = false,
  refractYFromOffset = true,
  pointFreq = 3,
  pointGenerations = 1,
  pointDistrib = PointDistribution.random,
  pointDrift = 0,
  pointCorners = false,
  xy = null,
  downsample = true,
) {
  const originalShape = shape
  if (downsample) {
    const dh = Math.max(1, Math.floor(shape[0] * 0.5))
    const dw = Math.max(1, Math.floor(shape[1] * 0.5))
    shape = [dh, dw, shape[2]]
  }
  const [h, w, c] = shape
  let xPts, yPts, count
  const f32 = Math.fround
  const blendCosineScalar = (a, b, g) => {
    const aa = f32(a ?? 0)
    const bb = f32(b ?? 0)
    const gg = f32(g)
    const angle = f32(gg * Math.PI)
    const cosVal = f32(Math.cos(angle))
    const g2 = f32((1 - cosVal) * 0.5)
    const oneMinus = f32(1 - g2)
    const termA = f32(f32(aa) * oneMinus)
    const termB = f32(f32(bb) * g2)
    return f32(termA + termB)
  }
  if (!xy) {
    let baseX
    let baseY
    if (pointFreq === 1) {
      [baseX, baseY] = pointCloud(pointFreq, {
        distrib: PointDistribution.square,
        shape,
      })
    } else {
      [baseX, baseY] = pointCloud(pointFreq, {
        distrib: pointDistrib,
        shape,
        corners: pointCorners,
        generations: pointGenerations,
        drift: pointDrift,
        time,
        speed,
      })
    }
    const xBase = Array.from(baseX ?? [])
    const yBase = Array.from(baseY ?? [])
    count = xBase.length
    if (!count) {
      return tensor
    }
    const blendedX = new Float32Array(count)
    const blendedY = new Float32Array(count)
    const timeVal = f32(time)
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count
      blendedX[i] = blendCosineScalar(xBase[i], xBase[next], timeVal)
      blendedY[i] = blendCosineScalar(yBase[i], yBase[next], timeVal)
    }
    xPts = blendedX
    yPts = blendedY
  } else {
    let rawX
    let rawY
    let rawCount;
    [rawX, rawY, rawCount] = xy
    xPts = Float32Array.from(rawX ?? [])
    yPts = Float32Array.from(rawY ?? [])
    count = rawCount ?? xPts.length
    if (downsample) {
      for (let i = 0; i < xPts.length; i++) {
        xPts[i] = f32(xPts[i] / 2)
      }
      for (let i = 0; i < yPts.length; i++) {
        yPts[i] = f32(yPts[i] / 2)
      }
    }
  }
  if (count === 0) return tensor
  const needFlow =
    diagramType === VoronoiDiagramType.flow ||
    diagramType === VoronoiDiagramType.color_flow
  const isTriangular =
    distMetric === DistanceMetric.triangular ||
    distMetric === DistanceMetric.hexagram ||
    distMetric === DistanceMetric.sdf
  if (needFlow) {
    const jitterX = randomNormalArray(count, 0, 0.0001)
    const jitterY = randomNormalArray(count, 0, 0.0001)
    for (let i = 0; i < count; i++) {
      xPts[i] += jitterX[i]
      yPts[i] += jitterY[i]
    }
  }
  const distMap = new Float32Array(h * w)
  const indexMap = new Int32Array(h * w)
  const flowMap = needFlow ? new Float32Array(h * w) : null
  const colorFlowMap =
    needFlow && tensor && diagramType === VoronoiDiagramType.color_flow
      ? new Float32Array(h * w * c)
      : null
  let maxDist = 0
  let minDist = Infinity
  const regionColorsNeeded =
    tensor &&
    (diagramType === VoronoiDiagramType.color_regions ||
      diagramType === VoronoiDiagramType.range_regions ||
      diagramType === VoronoiDiagramType.color_flow)
  const src = tensor ? await tensor.read() : null
  const srcH = tensor ? tensor.shape[0] : 0
  const srcW = tensor ? tensor.shape[1] : 0
  const pointColors = regionColorsNeeded
    ? new Float32Array(count * c)
    : null
  if (regionColorsNeeded) {
    const scaleY = srcH / h
    const scaleX = srcW / w
    for (let i = 0; i < count; i++) {
      const px = ((Math.trunc(yPts[i] * scaleY) % srcH) + srcH) % srcH
      const py = ((Math.trunc(xPts[i] * scaleX) % srcW) + srcW) % srcW
      const base = (px * srcW + py) * c
      for (let k = 0; k < c; k++) {
        pointColors[i * c + k] = Math.fround(src[base + k])
      }
    }
  }
  const halfW = Math.floor(w / 2)
  const halfH = Math.floor(h / 2)
  // The reference reads index -min(nth + 1, count - 1) of the distances
  // sorted in descending order; n is that position in ascending order.
  const sortedIndex = Math.min(nth + 1, count - 1)
  let n = needFlow
    ? 0
    : sortedIndex > 0
      ? sortedIndex - 1
      : count - 1 + sortedIndex
  if (n < 0) n = 0
  if (n >= count) n = count - 1
  const bestDists = new Float32Array(n + 1)
  const bestIdx = new Int32Array(n + 1)
  const colorSum = colorFlowMap ? new Float32Array(c) : null
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let j = 0; j <= n; j++) {
        bestDists[j] = Infinity
        bestIdx[j] = 0
      }
      let flowSum = 0
      if (colorSum) {
        for (let k = 0; k < c; k++) colorSum[k] = 0
      }
      const ySign = inverse ? -1 : 1
      for (let i = 0; i < count; i++) {
        let dx, dy
        // Float32 operations in the reference's order.
        const xd = Math.fround(x - xPts[i])
        const yd = Math.fround(y - yPts[i])
        if (isTriangular) {
          dx = Math.fround(xd / w)
          dy = Math.fround(Math.fround(yd * ySign) / h)
        } else {
          const x0 = Math.fround(xd - halfW)
          const x1 = Math.fround(xd + halfW)
          const y0 = Math.fround(yd - halfH)
          const y1 = Math.fround(yd + halfH)
          dx = Math.fround(Math.min(Math.abs(x0), Math.abs(x1)) / w)
          dy = Math.fround(Math.min(Math.abs(y0), Math.abs(y1)) / h)
        }
        const rawDist = distance(dx, dy, distMetric, sdfSides)
        if (!Number.isFinite(rawDist)) {
          continue
        }
        const d = Math.fround(rawDist)
        if (needFlow) {
          const ld = Math.fround(
            Math.max(-10, Math.min(10, Math.log(d))),
          )
          flowSum = Math.fround(flowSum + ld)
          if (colorSum) {
            for (let k = 0; k < c; k++) {
              colorSum[k] = Math.fround(
                colorSum[k] + Math.fround(ld * pointColors[i * c + k]),
              )
            }
          }
        }
        // The reference ranks distances with a stable descending top_k and
        // reads from the end, so among equal distances the higher point
        // index ranks as nearer. Points arrive in index order.
        if (d <= bestDists[n]) {
          let j = n
          while (j > 0 && d <= bestDists[j - 1]) {
            bestDists[j] = bestDists[j - 1]
            bestIdx[j] = bestIdx[j - 1]
            j--
          }
          bestDists[j] = d
          bestIdx[j] = i
        }
      }
      const idx = y * w + x
      if (needFlow) {
        flowMap[idx] = Math.fround(flowSum)
        if (colorFlowMap) {
          for (let k = 0; k < c; k++) {
            colorFlowMap[idx * c + k] = Math.fround(colorSum[k])
          }
        }
        const best = bestDists[0]
        const finiteBest = Number.isFinite(best) ? best : 0
        distMap[idx] = finiteBest
        indexMap[idx] = bestIdx[0]
      } else {
        const selDist = bestDists[n]
        const finiteDist = Number.isFinite(selDist) ? selDist : 0
        const selIdx = bestIdx[n]
        distMap[idx] = finiteDist
        indexMap[idx] = selIdx
        if (finiteDist > maxDist) maxDist = finiteDist
        if (finiteDist < minDist) minDist = finiteDist
      }
    }
  }
  let rangeTensor = null
  let indexTensor = null
  let regionsTensor = null
  let colorRegionsTensor = null
  let rangeData = null
  if (!needFlow) {
    rangeData = new Float32Array(h * w)
    const delta = Math.fround(maxDist - minDist)
    const hasRange = Number.isFinite(delta) && delta > 0
    for (let i = 0; i < h * w; i++) {
      let v = distMap[i]
      if (!Number.isFinite(v)) {
        v = 0
      }
      if (hasRange) {
        // Float32 arithmetic, as normalize() in the reference.
        v = Math.fround(Math.fround(v - minDist) / delta)
      }
      if (!Number.isFinite(v) || v < 0) {
        v = 0
      }
      rangeData[i] = Math.sqrt(v)
    }
    rangeTensor = Tensor.fromArray(tensor ? tensor.ctx : null, rangeData, [h, w, 1])
    indexTensor = Tensor.fromArray(
      tensor ? tensor.ctx : null,
      new Float32Array(indexMap),
      [h, w, 1],
    )
  }
  const xOff = isTriangular ? 0 : Math.floor(w / 2)
  const yOff = isTriangular ? 0 : Math.floor(h / 2)
  // offsetTensor expects a resolved Tensor; await any pending promises
  if (rangeTensor) {
    rangeTensor = await offsetTensor(await rangeTensor, xOff, yOff)
    if (downsample) {
      rangeTensor = await resample(rangeTensor, [originalShape[0], originalShape[1], 1])
    }
    // The reference inverts the range after resampling it.
    if (inverse) {
      const rangeOut = await rangeTensor.read()
      const inverted = new Float32Array(rangeOut.length)
      for (let i = 0; i < rangeOut.length; i++) {
        inverted[i] = Math.fround(1 - rangeOut[i])
      }
      rangeTensor = Tensor.fromArray(rangeTensor.ctx, inverted, rangeTensor.shape)
    }
  }
  if (indexTensor) indexTensor = await offsetTensor(await indexTensor, xOff, yOff)
  if (indexTensor) {
    const idxData = await indexTensor.read()
    regionsTensor = Tensor.fromArray(
      tensor ? tensor.ctx : null,
      Float32Array.from(idxData, (v) => v / count),
      [h, w, 1],
    )
    if (regionColorsNeeded) {
      const out = new Float32Array(h * w * c)
      for (let i = 0; i < h * w; i++) {
        const region = idxData[i]
        for (let k = 0; k < c; k++) {
          out[i * c + k] = pointColors[region * c + k]
        }
      }
      colorRegionsTensor = Tensor.fromArray(tensor.ctx, out, shape)
    }
  }
  let outTensor
  if (diagramType === VoronoiDiagramType.range) {
    outTensor = rangeTensor
  } else if (diagramType === VoronoiDiagramType.color_range && tensor) {
    let rTensor = rangeTensor
    if (downsample)
      rTensor = await resample(rangeTensor, [originalShape[0], originalShape[1], 1])
    rTensor = await rTensor
    const rData = await rTensor.read()
    const out = new Float32Array(originalShape[0] * originalShape[1] * c)
    for (let i = 0; i < rData.length; i++) {
      const r = rData[i]
      for (let k = 0; k < c; k++) {
        const base = i * c + k
        const aVal = src[base] * r
        out[base] = aVal * (1 - r) + r * r
      }
    }
    outTensor = Tensor.fromArray(tensor.ctx, out, [originalShape[0], originalShape[1], c])
  } else if (diagramType === VoronoiDiagramType.regions) {
    outTensor = regionsTensor
  } else if (diagramType === VoronoiDiagramType.color_regions && tensor) {
    outTensor = colorRegionsTensor
  } else if (diagramType === VoronoiDiagramType.range_regions && tensor) {
    const rangeSq = new Float32Array(h * w)
    for (let i = 0; i < h * w; i++) {
      const r = inverse ? 1 - rangeData[i] : rangeData[i]
      rangeSq[i] = r * r
    }
    const rangeSqTensor = Tensor.fromArray(tensor.ctx, rangeSq, [h, w, 1])
    outTensor = blend(colorRegionsTensor, rangeTensor, rangeSqTensor)
  } else if (diagramType === VoronoiDiagramType.flow) {
    const out = new Float32Array(h * w)
    for (let i = 0; i < h * w; i++) {
      let v = Math.fround(flowMap[i] / count)
      out[i] = Math.fround((v + 1.75) / 1.45)
    }
    outTensor = Tensor.fromArray(tensor ? tensor.ctx : null, out, [h, w, 1])
  } else if (diagramType === VoronoiDiagramType.color_flow && tensor) {
    const out = new Float32Array(h * w * c)
    for (let i = 0; i < h * w; i++) {
      for (let k = 0; k < c; k++) {
        let v = Math.fround(colorFlowMap[i * c + k] / count)
        out[i * c + k] = v
      }
    }
    outTensor = Tensor.fromArray(tensor.ctx, out, shape)
  } else {
    return tensor
  }
  if (
    diagramType === VoronoiDiagramType.flow ||
    diagramType === VoronoiDiagramType.color_flow
  ) {
    outTensor = await offsetTensor(outTensor, xOff, yOff)
  }
  // Python resamples every diagram to the original shape, with or without
  // downsampling, which also widens single-channel diagrams to its channels.
  const splineOrder =
    diagramType === VoronoiDiagramType.color_regions
      ? InterpolationType.constant
      : InterpolationType.bicubic
  outTensor = await resample(outTensor, originalShape, splineOrder)
  if (withRefract) {
    // Python's voronoi effect calls value.refract() directly with the
    // resampled diagram as the X reference.  When ``refract_y_from_offset`` is
    // False it derives both references from cos/sin of every channel of the
    // diagram, and the value map of each reference is its Oklab lightness.
    // When True the Y reference is the diagram offset by half the image, and
    // the reference also moves its sample coordinates by half the image, so
    // the source is offset by the same amount.  Mirror that behaviour here
    // instead of routing through the higher level ``refractEffect`` helper.

    let rx = outTensor
    let ry
    let source = tensor
    const [outH, outW] = outTensor.shape
    if (refractYFromOffset) {
      const xHalf = Math.floor(outW * 0.5)
      const yHalf = Math.floor(outH * 0.5)
      ry = await offsetTensor(outTensor, xHalf, yHalf)
      source = await offsetTensor(tensor, xHalf, yHalf)
    } else {
      const data = await outTensor.read()
      const size = data.length
      const tail = packetEnd(size)
      const tauF = f32(TAU)
      const cosData = new Float32Array(size)
      const sinData = new Float32Array(size)
      for (let i = 0; i < size; i++) {
        const angle = f32(f32(data[i]) * tauF)
        const cosVal = i < tail ? cos32(angle) : f32(Math.cos(angle))
        const sinVal = i < tail ? sin32(angle) : f32(Math.sin(angle))
        const cx = f32(f32(cosVal * 0.5) + 0.5)
        const cy = f32(f32(sinVal * 0.5) + 0.5)
        cosData[i] = Math.min(Math.max(cx, 0), 1)
        sinData[i] = Math.min(Math.max(cy, 0), 1)
      }
      const ctx = outTensor.ctx || (tensor ? tensor.ctx : null)
      rx = Tensor.fromArray(ctx, cosData, outTensor.shape)
      ry = Tensor.fromArray(ctx, sinData, outTensor.shape)
    }
    outTensor = await refractOp(
      source,
      rx,
      ry,
      withRefract,
      InterpolationType.bicubic,
      true,
    )
  }
  if (tensor) {
    return blend(tensor, outTensor, alpha)
  }
  return outTensor
}

register("voronoi", voronoi, {
  diagramType: VoronoiDiagramType.range,
  nth: 0,
  distMetric: DistanceMetric.euclidean,
  sdfSides: 3,
  alpha: 1,
  withRefract: 0,
  inverse: false,
  refractYFromOffset: true,
  pointFreq: 3,
  pointGenerations: 1,
  pointDistrib: PointDistribution.random,
  pointDrift: 0,
  pointCorners: false,
  xy: null,
  downsample: true,
})

export async function singularity(
  tensor,
  shape,
  time,
  speed,
  diagramType = VoronoiDiagramType.range,
  distMetric = DistanceMetric.euclidean,
) {
  const [x, y] = pointCloud(1, {
    distrib: PointDistribution.square,
    shape,
  })
  return await voronoi(
    tensor,
    shape,
    time,
    speed,
    diagramType,
    0,
    distMetric,
    1,
    1,
    0,
    false,
    true,
    1,
    1,
    PointDistribution.square,
    0,
    false,
    [x, y, 1],
    true,
  )
}
register("singularity", singularity, {
  diagramType: VoronoiDiagramType.range,
  distMetric: DistanceMetric.euclidean,
})

export async function lowpoly(
  tensor,
  shape,
  time,
  speed,
  distrib = PointDistribution.random,
  freq = 10,
  distMetric = DistanceMetric.euclidean,
) {
  const [xPts, yPts] = pointCloud(freq, {
    distrib,
    shape,
    drift: 1.0,
    time,
    speed,
  })
  const count = xPts.length
  if (count === 0) return tensor
  const xy = [xPts, yPts, count]
  const base = tensor
  // Match the Python implementation by passing the existing tensor into the
  // distance-field computation. Supplying `null` forces the CPU code path and
  // causes the demo to stall on large canvases. Providing the tensor enables
  // GPU acceleration when available and prevents the render-time hang observed
  // in the "basic-low-poly" preset.
  const distance = await voronoi(
    base,
    shape,
    time,
    speed,
    VoronoiDiagramType.range,
    1,
    distMetric,
    3,
    1,
    0,
    false,
    true,
    1,
    1,
    PointDistribution.square,
    0,
    false,
    xy,
    true,
  )
  const color = await voronoi(
    base,
    shape,
    time,
    speed,
    VoronoiDiagramType.color_regions,
    0,
    distMetric,
    3,
    1,
    0,
    false,
    true,
    1,
    1,
    PointDistribution.square,
    0,
    false,
    xy,
    true,
  )
  const blended = await blend(distance, color, 0.5)
  return await normalize(blended)
}
register("lowpoly", lowpoly, {
  distrib: PointDistribution.random,
  freq: 10,
  distMetric: DistanceMetric.euclidean,
})

export async function kaleido(
  tensor,
  shape,
  time,
  speed,
  sides = 6,
  sdfSides = 5,
  blendEdges = true,
  pointFreq = 1,
  pointGenerations = 1,
  pointDistrib = PointDistribution.random,
  pointDrift = 0,
  pointCorners = false,
  xy = null,
) {
  const [h, w, c] = shape
  const valueShape = [h, w, 1]
  let xyArg = null
  if (xy && typeof xy === "object") {
    const rawX = xy[0]
    const rawY = xy[1]
    const rawCount = xy[2]
    const isArrayLike = (value) =>
      Array.isArray(value) ||
      (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value))
    if (isArrayLike(rawX) && isArrayLike(rawY)) {
      const lengthFromParam = Number(rawCount)
      const xLength = Number(rawX.length ?? 0)
      const yLength = Number(rawY.length ?? 0)
      const fallbackLength =
        Number.isFinite(xLength) && Number.isFinite(yLength)
          ? Math.min(xLength, yLength)
          : 0
      const resolvedLength = Number.isFinite(lengthFromParam)
        ? Math.max(0, Math.floor(lengthFromParam))
        : fallbackLength
      const pointCount = resolvedLength || fallbackLength
      if (pointCount > 0) {
        xyArg = [rawX, rawY, pointCount]
      }
    }
  }
  const distMetric =
    sdfSides < 3 ? DistanceMetric.euclidean : DistanceMetric.sdf
  const rTensor = await voronoi(
    null,
    valueShape,
    time,
    speed,
    VoronoiDiagramType.range,
    0,
    distMetric,
    sdfSides,
    1,
    0,
    false,
    true,
    pointFreq,
    pointGenerations,
    pointDistrib,
    pointDrift,
    pointCorners,
    xyArg,
  )
  const r = await rTensor.read()
  let fader = null
  if (blendEdges) {
    const sTensor = await singularity(
      null,
      valueShape,
      time,
      speed,
      VoronoiDiagramType.range,
      DistanceMetric.chebyshev,
    )
    const fTensor = await normalize(sTensor)
    fader = await fTensor.read()
    for (let i = 0; i < fader.length; i++) fader[i] = Math.pow(fader[i], 5)
  }
  const src = await tensor.read()
  const out = new Float32Array(h * w * c)
  const step = (Math.PI * 2) / sides
  const denomX = w > 1 ? w - 1 : 1
  const denomY = h > 1 ? h - 1 : 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const xi = x / denomX - 0.5
      const yi = y / denomY - 0.5
      const radius = r[idx]
      let a = Math.atan2(yi, xi) + Math.PI / 2
      a = ((a % step) + step) % step
      a = Math.abs(a - step / 2)
      let nx = radius * w * Math.sin(a)
      let ny = radius * h * Math.cos(a)
      if (blendEdges) {
        const fade = fader[idx]
        nx = nx * (1 - fade) + x * fade
        ny = ny * (1 - fade) + y * fade
      }
      nx = ((Math.trunc(nx) % w) + w) % w
      ny = ((Math.trunc(ny) % h) + h) % h
      const srcBase = (ny * w + nx) * c
      const dstBase = idx * c
      for (let k = 0; k < c; k++) out[dstBase + k] = src[srcBase + k]
    }
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("kaleido", kaleido, {
  sides: 6,
  sdfSides: 5,
  blendEdges: true,
  pointFreq: 1,
  pointGenerations: 1,
  pointDistrib: PointDistribution.random,
  pointDrift: 0,
  pointCorners: false,
  xy: null,
})

export async function texture(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]

  const noiseMaybe = await simpleMultiresTensor(
    64,
    valueShape,
    time,
    speed,
    8,
    ctx,
    true,
  )
  const noise =
    noiseMaybe && typeof noiseMaybe.then === "function"
      ? await noiseMaybe
      : noiseMaybe

  const shadeTensor = await shadow(noise, valueShape, time, speed, 1)
  const shadeMaybe = shadeTensor.read()
  const shade =
    shadeMaybe && typeof shadeMaybe.then === "function"
      ? await shadeMaybe
      : shadeMaybe

  const srcMaybe = tensor.read()
  const src =
    srcMaybe && typeof srcMaybe.then === "function" ? await srcMaybe : srcMaybe
  const out = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const m = 0.9 + shade[i] * 0.1
    for (let k = 0; k < c; k++) out[i * c + k] = src[i * c + k] * m
  }
  return Tensor.fromArray(ctx, out, shape)
}
register("texture", texture, {})

export async function densityMap(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const bins = Math.max(h, w)
  const normalizedTensor = await normalize(tensor)
  const vals = await normalizedTensor.read()
  const total = vals.length
  const binIndices = new Int32Array(total)
  const counts = new Int32Array(bins)
  for (let i = 0; i < total; i++) {
    // Float32 product, truncated toward zero, as in the reference.
    let bin = Math.trunc(Math.fround(vals[i] * (bins - 1)))
    if (bin < 0) bin = 0
    if (bin >= bins) bin = bins - 1
    binIndices[i] = bin
    counts[bin]++
  }
  const gathered = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    gathered[i] = counts[binIndices[i]]
  }
  const gatheredTensor = Tensor.fromArray(tensor.ctx, gathered, shape)
  return normalize(gatheredTensor)
}
register("density_map", densityMap, {})

// JPEG round trip, as tf.image.encode_jpeg and tf.image.decode_jpeg perform
// it with libjpeg-turbo: baseline encoding with the standard quantization
// tables scaled by quality, 4:2:0 chroma subsampling for color, and the
// accurate integer forward DCT; decoding with the fast integer inverse DCT
// and fancy chroma upsampling, which are TensorFlow's decoding defaults.
// Entropy coding is lossless, so it is not performed.
const JPEG_LUMA_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16,
  24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120,
  101, 72, 92, 95, 98, 112, 100, 103, 99,
]
const JPEG_CHROMA_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56,
  99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99,
]
// AA&N scale factors for the fast inverse DCT, scaled up by 14 bits.
const JPEG_AAN_SCALES = [
  16384, 22725, 21407, 19266, 16384, 12873, 8867, 4520, 22725, 31521, 29692,
  26722, 22725, 17855, 12299, 6270, 21407, 29692, 27969, 25172, 21407, 16819,
  11585, 5906, 19266, 26722, 25172, 22654, 19266, 15137, 10426, 5315, 16384,
  22725, 21407, 19266, 16384, 12873, 8867, 4520, 12873, 17855, 16819, 15137,
  12873, 10114, 6967, 3552, 8867, 12299, 11585, 10426, 8867, 6967, 4799, 2446,
  4520, 6270, 5906, 5315, 4520, 3552, 2446, 1247,
]

// Rounding right shift of a signed integer.
function jpegDescale(x, n) {
  return Math.floor((x + 2 ** (n - 1)) / 2 ** n)
}

function jpegQuantTable(basic, quality) {
  const q = Math.min(Math.max(quality, 1), 100)
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2
  return basic.map((v) =>
    Math.min(Math.max(Math.floor((v * scale + 50) / 100), 1), 255),
  )
}

// Accurate integer forward DCT (jfdctint), in place. The output is scaled up
// by 8.
function jpegForwardDct(data) {
  const C = 13
  const P = 2
  for (let pass = 0; pass < 2; pass++) {
    const step = pass === 0 ? 1 : 8
    const stride = pass === 0 ? 8 : 1
    for (let ctr = 0; ctr < 8; ctr++) {
      const o = ctr * stride
      const d = (k) => data[o + k * step]
      const tmp0 = d(0) + d(7)
      let tmp7 = d(0) - d(7)
      const tmp1 = d(1) + d(6)
      let tmp6 = d(1) - d(6)
      const tmp2 = d(2) + d(5)
      let tmp5 = d(2) - d(5)
      const tmp3 = d(3) + d(4)
      let tmp4 = d(3) - d(4)
      const tmp10 = tmp0 + tmp3
      const tmp13 = tmp0 - tmp3
      const tmp11 = tmp1 + tmp2
      const tmp12 = tmp1 - tmp2
      const shift = pass === 0 ? C - P : C + P
      if (pass === 0) {
        data[o] = (tmp10 + tmp11) * 4
        data[o + 4 * step] = (tmp10 - tmp11) * 4
      } else {
        data[o] = jpegDescale(tmp10 + tmp11, P)
        data[o + 4 * step] = jpegDescale(tmp10 - tmp11, P)
      }
      let z1 = (tmp12 + tmp13) * 4433
      data[o + 2 * step] = jpegDescale(z1 + tmp13 * 6270, shift)
      data[o + 6 * step] = jpegDescale(z1 + tmp12 * -15137, shift)
      z1 = tmp4 + tmp7
      let z2 = tmp5 + tmp6
      let z3 = tmp4 + tmp6
      let z4 = tmp5 + tmp7
      const z5 = (z3 + z4) * 9633
      tmp4 *= 2446
      tmp5 *= 16819
      tmp6 *= 25172
      tmp7 *= 12299
      z1 *= -7373
      z2 *= -20995
      z3 = z3 * -16069 + z5
      z4 = z4 * -3196 + z5
      data[o + 7 * step] = jpegDescale(tmp4 + z1 + z3, shift)
      data[o + 5 * step] = jpegDescale(tmp5 + z2 + z4, shift)
      data[o + 3 * step] = jpegDescale(tmp6 + z2 + z3, shift)
      data[o + step] = jpegDescale(tmp7 + z1 + z4, shift)
    }
  }
}

// Fast integer inverse DCT (jidctfst) of dequantized coefficients, with the
// decoder's range limiting.
function jpegInverseDctFast(coefs, out, outOffset, outStride) {
  const mul = (v, k) => (v * k) >> 8
  const ws = new Int32Array(64)
  const rangeLimit = (v) => {
    const i = v & 1023
    if (i < 128) return i + 128
    if (i < 512) return 255
    if (i < 896) return 0
    return i - 896
  }
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? coefs : ws
    const step = pass === 0 ? 8 : 1
    const stride = pass === 0 ? 1 : 8
    for (let ctr = 0; ctr < 8; ctr++) {
      const o = ctr * stride
      const d = (k) => src[o + k * step]
      let allZero = true
      for (let k = 1; k < 8; k++) {
        if (d(k) !== 0) {
          allZero = false
          break
        }
      }
      if (allZero) {
        if (pass === 0) {
          for (let k = 0; k < 8; k++) ws[o + k * step] = d(0)
        } else {
          const dc = rangeLimit(d(0) >> 5)
          for (let k = 0; k < 8; k++) out[outOffset + ctr * outStride + k] = dc
        }
        continue
      }
      let tmp10 = d(0) + d(4)
      let tmp11 = d(0) - d(4)
      const tmp13 = d(2) + d(6)
      let tmp12 = mul(d(2) - d(6), 362) - tmp13
      const tmp0 = tmp10 + tmp13
      const tmp3 = tmp10 - tmp13
      const tmp1 = tmp11 + tmp12
      const tmp2 = tmp11 - tmp12
      const z13 = d(5) + d(3)
      const z10 = d(5) - d(3)
      const z11 = d(1) + d(7)
      const z12 = d(1) - d(7)
      const tmp7 = z11 + z13
      tmp11 = mul(z11 - z13, 362)
      const z5 = mul(z10 + z12, 473)
      tmp10 = mul(z12, 277) - z5
      tmp12 = mul(z10, -669) + z5
      const tmp6 = tmp12 - tmp7
      const tmp5 = tmp11 - tmp6
      const tmp4 = tmp10 + tmp5
      const results = [
        tmp0 + tmp7,
        tmp1 + tmp6,
        tmp2 + tmp5,
        tmp3 - tmp4,
        tmp3 + tmp4,
        tmp2 - tmp5,
        tmp1 - tmp6,
        tmp0 - tmp7,
      ]
      if (pass === 0) {
        for (let k = 0; k < 8; k++) ws[o + k * step] = results[k]
      } else {
        for (let k = 0; k < 8; k++) {
          out[outOffset + ctr * outStride + k] = rangeLimit(results[k] >> 5)
        }
      }
    }
  }
}

// Encode and decode one component plane. The plane's width and height are
// multiples of 8, padded as the encoder pads them.
function jpegCodePlane(plane, pw, ph, quant) {
  const divisors = quant.map((q) => q * 8)
  const multipliers = quant.map((q, i) =>
    jpegDescale(q * JPEG_AAN_SCALES[i], 12),
  )
  const out = new Uint8Array(pw * ph)
  const block = new Float64Array(64)
  const coefs = new Int32Array(64)
  for (let by = 0; by < ph; by += 8) {
    for (let bx = 0; bx < pw; bx += 8) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          block[y * 8 + x] = plane[(by + y) * pw + bx + x] - 128
        }
      }
      jpegForwardDct(block)
      for (let i = 0; i < 64; i++) {
        const t = block[i]
        const d = divisors[i]
        const q = Math.floor((Math.abs(t) + d / 2) / d)
        coefs[i] = (t < 0 ? -q : q) * multipliers[i]
      }
      jpegInverseDctFast(coefs, out, by * pw + bx, pw)
    }
  }
  return out
}

// Copy a plane into a larger one, replicating the last column and row.
function jpegPadPlane(src, w, h, pw, ph) {
  const out = new Uint8Array(pw * ph)
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(y, h - 1)
    for (let x = 0; x < pw; x++) {
      out[y * pw + x] = src[sy * w + Math.min(x, w - 1)]
    }
  }
  return out
}

function jpegRoundTripGray(bytes, h, w, quality) {
  const pw = Math.ceil(w / 8) * 8
  const ph = Math.ceil(h / 8) * 8
  const decoded = jpegCodePlane(
    jpegPadPlane(bytes, w, h, pw, ph),
    pw,
    ph,
    jpegQuantTable(JPEG_LUMA_QUANT, quality),
  )
  const out = new Uint8Array(h * w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = decoded[y * pw + x]
  }
  return out
}

function jpegRoundTripRgb(rgb, h, w, quality) {
  const fix = (v) => Math.floor(v * 65536 + 0.5)
  const yPlane = new Uint8Array(h * w)
  const cbPlane = new Uint8Array(h * w)
  const crPlane = new Uint8Array(h * w)
  const half = 32768
  const cbcrOffset = 128 * 65536
  for (let i = 0; i < h * w; i++) {
    const r = rgb[i * 3]
    const g = rgb[i * 3 + 1]
    const b = rgb[i * 3 + 2]
    yPlane[i] = Math.floor(
      (fix(0.299) * r + fix(0.587) * g + fix(0.114) * b + half) / 65536,
    )
    cbPlane[i] = Math.floor(
      (-fix(0.16874) * r - fix(0.33126) * g + fix(0.5) * b + cbcrOffset +
        half - 1) / 65536,
    )
    crPlane[i] = Math.floor(
      (fix(0.5) * r - fix(0.41869) * g - fix(0.08131) * b + cbcrOffset +
        half - 1) / 65536,
    )
  }

  // Luma: full resolution.
  const ypw = Math.ceil(w / 8) * 8
  const yph = Math.ceil(h / 8) * 8
  const yDecoded = jpegCodePlane(
    jpegPadPlane(yPlane, w, h, ypw, yph),
    ypw,
    yph,
    jpegQuantTable(JPEG_LUMA_QUANT, quality),
  )

  // Chroma: 2x2 downsampling with alternating rounding bias.
  const cpw = Math.ceil(w / 16) * 8
  const cph = Math.ceil(h / 16) * 8
  const cw = Math.ceil(w / 2)
  const ch = Math.ceil(h / 2)
  const chromaQuant = jpegQuantTable(JPEG_CHROMA_QUANT, quality)
  const codeChroma = (plane) => {
    const expanded = jpegPadPlane(plane, w, h, cpw * 2, ch * 2)
    const down = new Uint8Array(cpw * ch)
    for (let y = 0; y < ch; y++) {
      let bias = 1
      const r0 = 2 * y * cpw * 2
      const r1 = r0 + cpw * 2
      for (let x = 0; x < cpw; x++) {
        down[y * cpw + x] =
          (expanded[r0 + 2 * x] +
            expanded[r0 + 2 * x + 1] +
            expanded[r1 + 2 * x] +
            expanded[r1 + 2 * x + 1] +
            bias) >>
          2
        bias ^= 3
      }
    }
    const decoded = jpegCodePlane(
      jpegPadPlane(down, cpw, ch, cpw, cph),
      cpw,
      cph,
      chromaQuant,
    )
    // Upsample the real chroma samples, replicating edge rows for context.
    const up = new Uint8Array(cw * 2 * ch * 2)
    const upW = cw * 2
    for (let y = 0; y < ch; y++) {
      for (let v = 0; v < 2; v++) {
        const near = decoded.subarray(y * cpw)
        const farY = v === 0 ? Math.max(y - 1, 0) : Math.min(y + 1, ch - 1)
        const far = decoded.subarray(farY * cpw)
        const row = (2 * y + v) * upW
        if (cw > 2) {
          let thisSum = near[0] * 3 + far[0]
          let nextSum = near[1] * 3 + far[1]
          up[row] = (thisSum * 4 + 8) >> 4
          up[row + 1] = (thisSum * 3 + nextSum + 7) >> 4
          let lastSum = thisSum
          thisSum = nextSum
          for (let x = 1; x < cw - 1; x++) {
            nextSum = near[x + 1] * 3 + far[x + 1]
            up[row + 2 * x] = (thisSum * 3 + lastSum + 8) >> 4
            up[row + 2 * x + 1] = (thisSum * 3 + nextSum + 7) >> 4
            lastSum = thisSum
            thisSum = nextSum
          }
          up[row + 2 * cw - 2] = (thisSum * 3 + lastSum + 8) >> 4
          up[row + 2 * cw - 1] = (thisSum * 4 + 7) >> 4
        } else {
          for (let x = 0; x < cw; x++) {
            up[row + 2 * x] = near[x]
            up[row + 2 * x + 1] = near[x]
          }
        }
      }
    }
    return up
  }
  const cbUp = codeChroma(cbPlane)
  const crUp = codeChroma(crPlane)

  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)
  const upW = cw * 2
  const out = new Uint8Array(h * w * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lum = yDecoded[y * ypw + x]
      const cb = cbUp[y * upW + x] - 128
      const cr = crUp[y * upW + x] - 128
      const crR = Math.floor((fix(1.402) * cr + half) / 65536)
      const cbB = Math.floor((fix(1.772) * cb + half) / 65536)
      const g = Math.floor((-fix(0.34414) * cb + half - fix(0.71414) * cr) / 65536)
      const o = (y * w + x) * 3
      out[o] = clamp(lum + crR)
      out[o + 1] = clamp(lum + g)
      out[o + 2] = clamp(lum + cbB)
    }
  }
  return out
}

export async function jpegDecimate(
  tensor,
  shape,
  time,
  speed,
  iterations = 25,
) {
  const [h, w, c] = shape
  if (iterations <= 0) {
    return tensor
  }
  const scale = Math.fround(1 / 255)
  let data = await tensor.read()
  for (let i = 0; i < iterations; i++) {
    const quality = randomInt(5, 50)
    // The pixel density settings change no pixels, but use the RNG.
    randomInt(50, 500)
    randomInt(50, 500)
    // tf.image.convert_image_dtype(float32 -> uint8): scale by 255.5, then
    // truncate.
    const bytes = new Uint8Array(data.length)
    for (let j = 0; j < data.length; j++) {
      const v = Math.fround(data[j] * 255.5)
      bytes[j] = v > 0 ? Math.min(Math.trunc(v), 255) : 0
    }
    // Color channels go through the JPEG round trip. An alpha channel, which
    // JPEG cannot store, stays as it is.
    const colorChannels = c >= 3 ? 3 : 1
    const color = new Uint8Array(h * w * colorChannels)
    for (let p = 0; p < h * w; p++) {
      for (let k = 0; k < colorChannels; k++) {
        color[p * colorChannels + k] = bytes[p * c + k]
      }
    }
    const decoded =
      colorChannels === 3
        ? jpegRoundTripRgb(color, h, w, quality)
        : jpegRoundTripGray(color, h, w, quality)
    const next = new Float32Array(data.length)
    for (let p = 0; p < h * w; p++) {
      for (let k = 0; k < c; k++) {
        const byte =
          k < colorChannels ? decoded[p * colorChannels + k] : bytes[p * c + k]
        next[p * c + k] = Math.fround(byte * scale)
      }
    }
    data = next
  }
  return Tensor.fromArray(tensor.ctx, data, shape)
}
register("jpeg_decimate", jpegDecimate, { iterations: 25 })

const kernelCache = new Map()

async function getKernel(mask) {
  if (kernelCache.has(mask)) return kernelCache.get(mask)
  const [tensor] = maskValues(mask)
  const size = tensor.shape[0]
  // Scale the kernel by its largest absolute value in float32, as the
  // reference convolve does.
  const buildKernel = (data) => {
    let maxVal = -Infinity
    let minVal = Infinity
    for (let i = 0; i < size * size; i++) {
      if (data[i] > maxVal) maxVal = data[i]
      if (data[i] < minVal) minVal = data[i]
    }
    const denom = Math.fround(Math.max(maxVal, -minVal))
    const kernel = []
    for (let y = 0; y < size; y++) {
      const row = []
      for (let x = 0; x < size; x++) {
        row.push(denom ? Math.fround(data[y * size + x] / denom) : 0)
      }
      kernel.push(row)
    }
    return kernel
  }
  const dataMaybe = tensor.read()
  let result
  if (dataMaybe && typeof dataMaybe.then === "function") {
    result = dataMaybe.then(buildKernel)
  } else {
    result = buildKernel(dataMaybe)
  }
  kernelCache.set(mask, result)
  return result
}

export async function convFeedback(
  tensor,
  shape,
  time,
  speed,
  iterations = 100,
  alpha = 0.5,
) {
  const halfShape = [
    Math.max(1, Math.floor(shape[0] * 0.5)),
    Math.max(1, Math.floor(shape[1] * 0.5)),
    shape[2],
  ]
  let convolved = await proportionalDownsample(tensor, shape, halfShape)
  const blurKernel = await getKernel(ValueMask.conv2d_blur)
  const sharpenKernel = await getKernel(ValueMask.conv2d_sharpen)
  const iterCountRaw = Number(iterations)
  const iterCount = Number.isFinite(iterCountRaw)
    ? Math.max(0, Math.floor(iterCountRaw))
    : 100
  for (let i = 0; i < iterCount; i++) {
    convolved = await convolution(convolved, blurKernel)
    convolved = await convolution(convolved, sharpenKernel)
  }
  convolved = await normalize(convolved)
  const ctx = convolved.ctx
  const data = await convolved.read()
  const combined = new Float32Array(data.length)
  // Float32 arithmetic in the reference's order.
  for (let i = 0; i < data.length; i++) {
    const up = Math.max(Math.fround(Math.fround(data[i] - 0.5) * 2), 0)
    const down = Math.min(Math.fround(data[i] * 2), 1)
    combined[i] = Math.fround(up + Math.fround(1 - down))
  }
  const combinedTensor = Tensor.fromArray(ctx, combined, convolved.shape)
  const resampled = await resample(combinedTensor, shape)
  return blend(tensor, resampled, alpha)
}
register("conv_feedback", convFeedback, { iterations: 100, alpha: 0.5 })

export function blendLayers(control, shape, feather = 1, ...layers) {
  let layerCount = layers.length
  const controlNorm = normalize(control)
  const ctrl = controlNorm.read()
  const [h, w, c] = shape
  const scaled = new Float32Array(h * w)
  for (let i = 0; i < h * w; i++) scaled[i] = ctrl[i] * layerCount
  const floors = new Int32Array(h * w)
  for (let i = 0; i < h * w; i++) floors[i] = Math.floor(scaled[i])
  const layerData = layers.map((l) => l.read())
  layerData.push(layerData[layerData.length - 1])
  layerCount += 1
  // Float32 operations, as in the Python reference.
  const featherF = Math.fround(feather)
  const edge = Math.fround(1 - feather)
  const out = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const f0 = floors[i] % layerCount
    const f1 = (floors[i] + 1) % layerCount
    const base = i * c
    const fract = Math.fround(scaled[i] - Math.floor(scaled[i]))
    const ramp = Math.max(Math.fround(fract - edge), 0)
    const t = Math.min(Math.fround(ramp / featherF), 1)
    const inv = Math.fround(1 - t)
    const l0 = layerData[f0]
    const l1 = layerData[f1]
    for (let k = 0; k < c; k++) {
      out[base + k] = Math.fround(
        Math.fround(l0[base + k] * inv) + Math.fround(l1[base + k] * t),
      )
    }
  }
  return Tensor.fromArray(control.ctx, out, shape)
}

export function centerMask(
  center,
  edges,
  shape,
  distMetric = DistanceMetric.chebyshev,
  power = 2,
) {
  const run = () => {
    const [h, w, c] = shape
    const cx = (w - 1) / 2
    const cy = (h - 1) / 2
    const dists = new Float32Array(h * w)
    let max = 0
    for (let y = 0; y < h; y++) {
      const dy = Math.abs(y - cy)
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x - cx)
        const d = distance(dx, dy, distMetric)
        dists[y * w + x] = d
        if (d > max) max = d
      }
    }
    const denom = max || 1
    const mask = new Float32Array(h * w * c)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let ratio = dists[y * w + x] / denom
        ratio = Math.pow(ratio, power)
        const base = (y * w + x) * c
        for (let k = 0; k < c; k++) {
          mask[base + k] = ratio
        }
      }
    }
    const outCtx = center?.ctx || edges?.ctx || null
    const maskTensor = Tensor.fromArray(outCtx, mask, shape)
    return blend(center, edges, maskTensor)
  }

  return run()
}

export function innerTile(tensor, shape, freq) {
  const baseFreq = Array.isArray(freq) ? freq : freqForShape(freq, shape)
  const freqY = Math.max(1, Math.trunc(baseFreq[0] ?? 1))
  const freqX = Math.max(1, Math.trunc(baseFreq[1] ?? 1))
  const [h, w, cRaw] = shape
  const innerH = Math.max(1, Math.trunc(h / freqY))
  const innerW = Math.max(1, Math.trunc(w / freqX))
  const tileH = Math.max(1, innerH * freqY)
  const tileW = Math.max(1, innerW * freqY)

  const run = () =>
    withTensorData(tensor, (src) => {
      const tiled = new Float32Array(tileH * tileW * cRaw)
      for (let y = 0; y < tileH; y++) {
        const srcY = (y % innerH) * freqY
        const srcRow = srcY * w * cRaw
        const rowBase = y * tileW * cRaw
        for (let x = 0; x < tileW; x++) {
          const srcX = (x % innerW) * freqX
          const srcIndex = srcRow + srcX * cRaw
          const dstIndex = rowBase + x * cRaw
          for (let k = 0; k < cRaw; k++) {
            tiled[dstIndex + k] = src[srcIndex + k] ?? 0
          }
        }
      }
      const tiledTensor = Tensor.fromArray(tensor.ctx, tiled, [tileH, tileW, cRaw])
      return resample(tiledTensor, shape, InterpolationType.linear)
    })
  return run()
}

export function expandTile(
  tensor,
  inputShape,
  outputShape,
  withOffset = true,
) {
  const [rawInH, rawInW] = inputShape ?? []
  const [rawOutH, rawOutW] = outputShape ?? []
  const inH = Math.max(0, Math.trunc(rawInH ?? 0))
  const inW = Math.max(0, Math.trunc(rawInW ?? 0))
  const outH = Math.max(0, Math.trunc(rawOutH ?? 0))
  const outW = Math.max(0, Math.trunc(rawOutW ?? 0))
  const channelCount = Math.max(
    1,
    Math.trunc(tensor?.shape?.[2] ?? 1),
  )
  const xOff = withOffset ? Math.floor(inW / 2) : 0
  const yOff = withOffset ? Math.floor(inH / 2) : 0

  const run = () =>
    withTensorData(tensor, (src) => {
      const out = new Float32Array(outH * outW * channelCount)
      const wrap = (n, mod) => {
        if (mod <= 0) return 0
        const r = n % mod
        return r < 0 ? r + mod : r
      }
      for (let y = 0; y < outH; y++) {
        const sy = wrap(y + yOff, inH)
        for (let x = 0; x < outW; x++) {
          const sx = wrap(x + xOff, inW)
          for (let k = 0; k < channelCount; k++) {
            out[(y * outW + x) * channelCount + k] =
              src[(sy * inW + sx) * channelCount + k]
          }
        }
      }
      return Tensor.fromArray(tensor.ctx, out, [outH, outW, channelCount])
    })

  if (
    inH <= 0 ||
    inW <= 0 ||
    outH <= 0 ||
    outW <= 0 ||
    channelCount <= 0 ||
    channelCount > 4
  ) {
    return run()
  }

  return run()
}

export function offsetIndex(yIndex, height, xIndex, width) {
  const yOffset = Math.floor(height * 0.5 + random() * height * 0.5)
  const xOffset = Math.floor(random() * width * 0.5)
  const fallback = () =>
    withTensorDatas([yIndex, xIndex], (yData, xData) => {
      const total = height * width
      const yArr = new Int32Array(total)
      const xArr = new Int32Array(total)
      for (let i = 0; i < total; i++) {
        yArr[i] = Math.floor(yData[i] ?? 0)
        xArr[i] = Math.floor(xData[i] ?? 0)
      }
      const offs = offsetIndexInternal(
        yArr,
        height,
        xArr,
        width,
        yOffset,
        xOffset,
      )
      const interleaved = new Int32Array(total * 2)
      for (let i = 0; i < total; i++) {
        interleaved[i * 2] = offs.y[i]
        interleaved[i * 2 + 1] = offs.x[i]
      }
      const ctxOut = (yIndex && yIndex.ctx) || (xIndex && xIndex.ctx) || null
      return Tensor.fromArray(ctxOut, interleaved, [height, width, 2])
    })

  return fallback()
}

export async function posterize(tensor, shape, time, speed, levels = 9) {
  if (levels === 0) return tensor
  const outShape = shape.slice()
  if (outShape.length < 3 || outShape[2] == null) {
    outShape[2] = tensor.shape?.[2] ?? 1
  }
  const [h, w] = outShape

  const run = async () => {
    let t = tensor
    if (outShape[2] === 3) {
      t = await fromSRGB(t)
    }
    let src = await t.read()
    const expected = outShape[0] * outShape[1] * outShape[2]
    if (src.length !== expected) {
      const pixels = outShape[0] * outShape[1]
      const srcChannels = src.length / pixels
      const tmp = new Float32Array(expected)
      for (let i = 0; i < pixels; i++) {
        const srcBase = i * srcChannels
        const dstBase = i * outShape[2]
        for (let k = 0; k < outShape[2]; k++) {
          const srcIdx = srcBase + Math.min(k, srcChannels - 1)
          tmp[dstBase + k] = src[srcIdx]
        }
      }
      src = tmp
    }
    const srcArr =
      src instanceof Float32Array ? src : Float32Array.from(src ?? [])
    const out = new Float32Array(expected)
    const levelFactor = Math.fround(levels)
    const invFactor = levelFactor === 0 ? 0 : Math.fround(1 / levelFactor)
    const halfStep = Math.fround(invFactor * 0.5)
    for (let i = 0; i < expected; i++) {
      const value = Math.fround(srcArr[i] ?? 0)
      const scaled = Math.fround(value * levelFactor)
      const shifted = Math.fround(scaled + halfStep)
      const quantized = Math.floor(shifted)
      out[i] = Math.fround(quantized * invFactor)
    }
    let result = Tensor.fromArray(t.ctx, out, outShape)
    if (outShape[2] === 3) {
      result = await toSRGB(result)
    }
    return result
  }

  return run()
}
register("posterize", posterize, { levels: 9 })

export async function smoothstep(tensor, shape, time, speed, a = 0, b = 1) {
  let delta = b - a
  if (!delta) {
    delta = 1
  }
  const invRange = 1 / delta
  const src = await tensor.read()
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) {
    let t = (src[i] - a) * invRange
    if (t < 0) t = 0
    else if (t > 1) t = 1
    out[i] = t * t * (3 - 2 * t)
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("smoothstep", smoothstep, { a: 0, b: 1 })

export function convolve(
  tensor,
  shape,
  time,
  speed,
  kernel = ValueMask.conv2d_blur,
  withNormalize = true,
  alpha = 1,
) {
  let kernelArr = kernel
  if (!Array.isArray(kernelArr[0])) {
    const kTensor = maskValues(kernel)[0]
    const [kh, kw] = maskShape(kernel)
    const flat = kTensor.read()
    kernelArr = []
    for (let y = 0; y < kh; y++) {
      const row = []
      for (let x = 0; x < kw; x++) {
        row.push(flat[y * kw + x])
      }
      kernelArr.push(row)
    }
  }
  let out = convolution(tensor, kernelArr, { normalize: withNormalize })
  const finish = (o) => {
    const handle = (tensorOut) => {
      if (kernel === ValueMask.conv2d_edges) {
        const data = tensorOut.read()
        if (data && typeof data.then === 'function') {
          return data.then((arr) => {
            for (let i = 0; i < arr.length; i++) {
              arr[i] = Math.abs(arr[i] - 0.5) * 2
            }
            let tOut = Tensor.fromArray(tensorOut.ctx, arr, tensorOut.shape)
            if (typeof alpha !== 'number' || alpha < 1) {
              const blended = blend(tensor, tOut, alpha)
              return blended && typeof blended.then === 'function'
                ? blended
                : blended
            }
            return tOut
          })
        }
        for (let i = 0; i < data.length; i++) {
          data[i] = Math.abs(data[i] - 0.5) * 2
        }
        tensorOut = Tensor.fromArray(tensorOut.ctx, data, tensorOut.shape)
      }
      if (typeof alpha !== 'number' || alpha < 1) {
        const blended = blend(tensor, tensorOut, alpha)
        if (blended && typeof blended.then === 'function') return blended
        return blended
      }
      return tensorOut
    }

    if (o && typeof o.then === 'function') {
      return o.then(handle)
    }
    return handle(o)
  }

  return finish(out)
}
register("convolve", convolve, {
  kernel: ValueMask.conv2d_blur,
  withNormalize: true,
  alpha: 1,
})

export async function fbm(
  tensor,
  shape,
  time,
  speed,
  freq = 4,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
) {
  const [h, w, c] = shape
  const ctx = tensor?.ctx ?? null
  const baseFreq = Array.isArray(freq) ? freq : freqForShape(freq, [h, w])
  const data = new Float32Array(h * w * c)
  for (let octave = 1; octave <= octaves; octave++) {
    const octaveFreq = baseFreq.map((f) =>
      Math.floor(f * Math.pow(lacunarity, octave - 1)),
    )
    if (octaveFreq[0] > h && octaveFreq[1] > w) {
      break
    }
    const layerMaybe = await values(octaveFreq, shape, { ctx, time, speed })
    const layerDataMaybe = layerMaybe.read()
    const layerData =
      layerDataMaybe && typeof layerDataMaybe.then === "function"
        ? await layerDataMaybe
        : layerDataMaybe
    const layerArray =
      layerData instanceof Float32Array
        ? layerData
        : new Float32Array(layerData ?? [])
    const weight = Math.pow(gain, octave)
    for (let i = 0; i < data.length; i++) {
      data[i] += layerArray[i] * weight
    }
  }
  const tensorOut = Tensor.fromArray(ctx, data, shape)
  return await normalize(tensorOut)
}
register("fbm", fbm, { freq: 4, octaves: 4, lacunarity: 2, gain: 0.5 })

const TAU = Math.PI * 2

export async function palette(tensor, shape, time, speed, name = null, alpha = 1) {
  if (!name) return tensor
  const [h, w, c] = shape
  if (c === 1 || c === 2) return tensor

  const p = PALETTES[name]
  if (!p) throw new Error(`Unknown palette ${name}`)

  let alphaChan = null
  let baseTensor = tensor
  if (c === 4) {
    const srcMaybe = tensor.read()
    const src =
      srcMaybe && typeof srcMaybe.then === "function" ? await srcMaybe : srcMaybe
    const rgbData = new Float32Array(h * w * 3)
    alphaChan = new Float32Array(h * w)
    for (let i = 0; i < h * w; i++) {
      const base = i * 4
      rgbData[i * 3] = Math.fround(src[base] ?? 0)
      rgbData[i * 3 + 1] = Math.fround(src[base + 1] ?? 0)
      rgbData[i * 3 + 2] = Math.fround(src[base + 2] ?? 0)
      alphaChan[i] = Math.fround(src[base + 3] ?? 0)
    }
    baseTensor = Tensor.fromArray(tensor.ctx, rgbData, [h, w, 3])
  }

  const clamped = await clamp01(baseTensor)
  const labTensor = await rgbToOklab(clamped)
  const labMaybe = labTensor.read()
  const labRaw =
    labMaybe && typeof labMaybe.then === "function" ? await labMaybe : labMaybe
  const lab =
    labRaw instanceof Float32Array
      ? labRaw
      : Float32Array.from(labRaw ?? [])
  const out = new Float32Array(h * w * 3)
  // Float32 operations in the reference's order.
  const f32 = Math.fround
  const tauF = f32(TAU)
  const offset = [0, 1, 2].map((k) => f32(p.offset[k] ?? 0))
  const amp = [0, 1, 2].map((k) => f32(p.amp[k] ?? 0))
  const freq = [0, 1, 2].map((k) => f32(p.freq[k] ?? 0))
  const phase = [0, 1, 2].map((k) => f32(f32(p.phase[k] ?? 0) + f32(time)))
  for (let i = 0; i < h * w; i++) {
    const t = lab[i * 3] ?? 0
    for (let k = 0; k < 3; k++) {
      const scaled = f32(f32(f32(freq[k] * t) * 0.875) + 0.0625)
      const arg = f32(scaled + phase[k])
      const cos = cos32(f32(tauF * arg))
      out[i * 3 + k] = f32(offset[k] + f32(amp[k] * cos))
    }
  }
  const colored = Tensor.fromArray(tensor.ctx, out, [h, w, 3])

  let tBlend
  if (typeof alpha === "number") {
    const angle = Math.fround(alpha * Math.PI)
    const cosVal = Math.fround(Math.cos(angle))
    tBlend = Math.fround((1 - cosVal) * 0.5)
  } else {
    const aDataMaybe = alpha.read()
    const aData =
      aDataMaybe && typeof aDataMaybe.then === "function"
        ? await aDataMaybe
        : aDataMaybe
    const arr =
      aData instanceof Float32Array ? aData : Float32Array.from(aData ?? [])
    const tData = new Float32Array(arr.length)
    for (let i = 0; i < arr.length; i++) {
      const angle = Math.fround(arr[i] * Math.PI)
      const cosVal = Math.fround(Math.cos(angle))
      tData[i] = Math.fround((1 - cosVal) * 0.5)
    }
    tBlend = Tensor.fromArray(alpha.ctx, tData, alpha.shape)
  }

  let blended = await blend(baseTensor, colored, tBlend)

  if (alphaChan) {
    const blendedDataMaybe = blended.read()
    const blendedData =
      blendedDataMaybe && typeof blendedDataMaybe.then === "function"
        ? await blendedDataMaybe
        : blendedDataMaybe
    const blendArr =
      blendedData instanceof Float32Array
        ? blendedData
        : Float32Array.from(blendedData ?? [])
    const final = new Float32Array(h * w * 4)
    for (let i = 0; i < h * w; i++) {
      final[i * 4] = Math.fround(blendArr[i * 3] ?? 0)
      final[i * 4 + 1] = Math.fround(blendArr[i * 3 + 1] ?? 0)
      final[i * 4 + 2] = Math.fround(blendArr[i * 3 + 2] ?? 0)
      final[i * 4 + 3] = Math.fround(alphaChan[i] ?? 0)
    }
    blended = Tensor.fromArray(tensor.ctx, final, [h, w, 4])
  }

  return markPresentationNormalized(blended)
}
register("palette", palette, { name: null, alpha: 1 })

export async function invert(tensor, shape, time, speed) {
  const src = await tensor.read()
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) {
    out[i] = 1 - src[i]
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("invert", invert, {})

export async function vortex(tensor, shape, time, speed, displacement = 64) {
  const valueShape = [shape[0], shape[1], 1]
  const staticTime = 0
  const staticSpeed = 1
  let dispMap = await singularity(null, valueShape, staticTime, staticSpeed)
  dispMap = await normalize(dispMap)
  let x = await convolve(
    dispMap,
    valueShape,
    time,
    speed,
    ValueMask.conv2d_deriv_x,
    false,
  )
  let y = await convolve(
    dispMap,
    valueShape,
    time,
    speed,
    ValueMask.conv2d_deriv_y,
    false,
  )
  let fader = await singularity(
    null,
    valueShape,
    staticTime,
    staticSpeed,
    VoronoiDiagramType.range,
    DistanceMetric.chebyshev,
  )
  fader = await invert(
    await normalize(fader),
    valueShape,
    staticTime,
    staticSpeed,
  )
  const disp = simplexRandom(time, undefined, speed) * 100 * displacement
  const [xData, yData, fData] = await Promise.all([
    x.read(),
    y.read(),
    fader.read(),
  ])
  for (let i = 0; i < xData.length; i++) {
    xData[i] *= fData[i]
    yData[i] *= fData[i]
  }
  x = Tensor.fromArray(tensor.ctx, xData, valueShape)
  y = Tensor.fromArray(tensor.ctx, yData, valueShape)
  return refractOp(
    tensor,
    x,
    y,
    disp,
    InterpolationType.bicubic,
    false,
  )
}
register("vortex", vortex, { displacement: 64 })

export async function aberration(
  tensor,
  shape,
  time,
  speed,
  displacement = 0.005,
) {
  const [h, w, c] = shape
  if (c !== 3) return tensor

  const displacementPixels = Math.floor(
    w * displacement * simplexRandom(time, undefined, speed),
  )
  const hueShift = random() * 0.1 - 0.05

  const maskTensor = await singularity(null, [h, w, 1], time, speed)
  const maskData = await maskTensor.read()
  for (let i = 0; i < maskData.length; i++) {
    maskData[i] = pow32(maskData[i], 3)
  }

  const tinted = await adjustHue(tensor, hueShift)
  const tintedTex = tinted
  const xIndex = new Float32Array(h * w)
  const yIndex = new Int32Array(h * w)
  const gradient = new Float32Array(h * w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      xIndex[idx] = x
      yIndex[idx] = y
      gradient[idx] = w > 1 ? x / (w - 1) : 0
    }
  }

  const src = await tintedTex.read()
  // Float32 arithmetic in the order of the Python reference. The offsets are
  // truncated to integers, so a rounding difference changes the pixel read.
  const f32 = Math.fround
  const blendLinear = (a, b, t) =>
    f32(f32(a * f32(1 - t)) + f32(b * t))
  const pi = f32(Math.PI)
  const blendCosine = (a, b, g) => {
    const weight = f32(f32(1 - cos32(f32(g * pi))) / 2)
    return blendLinear(a, b, weight)
  }
  const clampIndex = (value) => {
    if (value <= 0) return 0
    if (value >= w - 1) return w - 1
    return Math.trunc(value)
  }

  const out = new Float32Array(h * w * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const base = idx * 3
      const xFloat = xIndex[idx]
      const g = gradient[idx]
      const m = maskData[idx]

      let redOffset = Math.min(w - 1, xFloat + displacementPixels)
      redOffset = blendLinear(redOffset, xFloat, g)
      redOffset = blendCosine(xFloat, redOffset, m)
      const redX = clampIndex(redOffset)

      let blueOffset = Math.max(0, xFloat - displacementPixels)
      blueOffset = blendLinear(xFloat, blueOffset, g)
      blueOffset = blendCosine(xFloat, blueOffset, m)
      const blueX = clampIndex(blueOffset)

      const greenOffset = blendCosine(xFloat, xFloat, m)
      const greenX = clampIndex(greenOffset)

      const rowBase = yIndex[idx] * w
      out[base] = src[(rowBase + redX) * 3]
      out[base + 1] = src[(rowBase + greenX) * 3 + 1]
      out[base + 2] = src[(rowBase + blueX) * 3 + 2]
    }
  }

  const displaced = Tensor.fromArray(tensor.ctx, out, shape)
  return adjustHue(displaced, -hueShift)
}
register("aberration", aberration, { displacement: 0.005 })

export async function vhs(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const scanNoise = await values(Math.floor(h * 0.5) + 1, [h, w, 1], {
    time,
    speed: speed * 100,
    ctx,
  })
  const gradNoise = await values([5, 1], [h, w, 1], { time, speed, ctx })

  const scanArr = await scanNoise.read()
  const gradArr = await gradNoise.read()
  const src = await tensor.read()
  // Float32 arithmetic in the order of the Python reference: the offsets are
  // truncated to integers, so a rounding difference changes the pixel read.
  const f32 = Math.fround
  const gradAt = (i) => Math.min(f32(Math.max(f32(gradArr[i] - 0.5), 0) * 2), 1)
  const blended = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const g = gradAt(i)
    const noise = scanArr[i]
    for (let k = 0; k < c; k++) {
      blended[i * c + k] = f32(f32(src[i * c + k] * f32(1 - g)) + f32(noise * g))
    }
  }
  const out = new Float32Array(h * w * c)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const g = gradAt(idx)
      const xOff = Math.trunc(f32(f32(scanArr[idx] * w) * f32(g * g)))
      const srcX = (((x - xOff) % w) + w) % w
      for (let k = 0; k < c; k++) {
        out[idx * c + k] = blended[(y * w + srcX) * c + k]
      }
    }
  }
  return Tensor.fromArray(ctx, out, shape)
}
register("vhs", vhs, {})

export async function lensWarp(tensor, shape, time, speed, displacement = 0.0625) {
  const [h, w] = [shape[0], shape[1]]
  const valueShape = [h, w, 1]
  const ctx = tensor?.ctx ?? null
  const maskTensor = await singularity(null, valueShape, 0, 0)
  const mask = await maskTensor.read()
  for (let i = 0; i < mask.length; i++) mask[i] = pow32(mask[i], 5)
  const noiseTensor = await values(2, valueShape, {
    ctx,
    time,
    speed,
    splineOrder: InterpolationType.cosine,
  })
  const noise = await noiseTensor.read()
  const cosData = new Float32Array(noise.length)
  const sinData = new Float32Array(noise.length)
  // Float32 arithmetic and trigonometry, as in the Python reference.
  const f32 = Math.fround
  const tau = f32(Math.PI * 2)
  for (let i = 0; i < noise.length; i++) {
    const base = f32(f32(f32(noise[i] * 2) - 1) * mask[i])
    const angle = f32(base * tau)
    let cx = f32(f32(cos32(angle) * 0.5) + 0.5)
    let sy = f32(f32(sin32(angle) * 0.5) + 0.5)
    if (cx < 0) cx = 0
    else if (cx > 1) cx = 1
    if (sy < 0) sy = 0
    else if (sy > 1) sy = 1
    cosData[i] = cx
    sinData[i] = sy
  }
  const refX = Tensor.fromArray(tensor.ctx, cosData, valueShape)
  const refY = Tensor.fromArray(tensor.ctx, sinData, valueShape)
  return await refractOp(tensor, refX, refY, displacement)
}
register("lensWarp", lensWarp, { displacement: 0.0625 })
register("lens_warp", lensWarp, { displacement: 0.0625 })

export async function lensDistortion(tensor, shape, time, speed, displacement = 1) {
  const [h, w, c] = shape
  const src = await tensor.read()
  const out = new Float32Array(h * w * c)
  // Float32 arithmetic in the order of the Python reference: the offsets are
  // truncated to integers, so a rounding difference changes the pixel read.
  const f32 = Math.fround
  const zoom = f32(displacement < 0 ? displacement * -0.25 : 0)
  const disp = f32(displacement)
  const dist = new Float32Array(h * w)
  let minDist = Infinity
  let maxDist = -Infinity
  for (let y = 0; y < h; y++) {
    const yDist = f32(f32(y / h) - 0.5)
    for (let x = 0; x < w; x++) {
      const xDist = f32(f32(x / w) - 0.5)
      const d = f32(Math.sqrt(f32(f32(xDist * xDist) + f32(yDist * yDist))))
      dist[y * w + x] = d
      if (d < minDist) minDist = d
      if (d > maxDist) maxDist = d
    }
  }
  const range = f32(maxDist - minDist)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xIndex = f32(x / w)
      const yIndex = f32(y / h)
      const xDist = f32(xIndex - 0.5)
      const yDist = f32(yIndex - 0.5)
      const d = dist[y * w + x]
      const normalized =
        range === 0 ? d : f32(f32(d - minDist) / range)
      const centerDist = f32(1 - normalized)
      const xOff = f32(
        f32(
          f32(xIndex - f32(xDist * zoom)) -
            f32(f32(f32(xDist * centerDist) * centerDist) * disp),
        ) * w,
      )
      const yOff = f32(
        f32(
          f32(yIndex - f32(yDist * zoom)) -
            f32(f32(f32(yDist * centerDist) * centerDist) * disp),
        ) * h,
      )
      const xi = ((Math.trunc(xOff) % w) + w) % w
      const yi = ((Math.trunc(yOff) % h) + h) % h
      const srcIdx = (yi * w + xi) * c
      const dstIdx = (y * w + x) * c
      for (let k = 0; k < c; k++) {
        out[dstIdx + k] = src[srcIdx + k] || 0
      }
    }
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("lensDistortion", lensDistortion, { displacement: 1 })
register("lens_distortion", lensDistortion, { displacement: 1 })

export async function degauss(tensor, shape, time, speed, displacement = 0.0625) {
  const [h, w, c] = shape
  const channelShape = [h, w, 1]
  const src = await tensor.read()
  const channels = Math.min(3, c)
  const out = new Float32Array(h * w * c)
  for (let k = 0; k < channels; k++) {
    const channelData = new Float32Array(h * w)
    for (let i = 0; i < h * w; i++) channelData[i] = src[i * c + k] || 0
    const channelTensor = Tensor.fromArray(
      tensor.ctx,
      channelData,
      channelShape,
    )
    const warpedTensor = await lensWarp(
      channelTensor,
      channelShape,
      time,
      speed,
      displacement,
    )
    const warped = await warpedTensor.read()
    for (let i = 0; i < h * w; i++) out[i * c + k] = warped[i]
  }
  if (c > 3) {
    for (let i = 0; i < h * w; i++) out[i * c + 3] = src[i * c + 3]
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("degauss", degauss, { displacement: 0.0625 })

export async function scanlineError(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]
  const errorFreq = [Math.floor(h * 0.5) || 1, Math.floor(w * 0.5) || 1]

  let errorLine = await values(errorFreq, valueShape, {
    ctx,
    time,
    speed: speed * 10,
    distrib: ValueDistribution.exp,
  })

  // Horizontal swerve bands: the reference uses a frequency of 1% of the
  // height. Below a height of 100 that frequency is 0, so use 1.
  const swerveHeight = Math.max(Math.floor(h * 0.01), 1)
  let errorSwerve = await values([swerveHeight, 1], valueShape, {
    ctx,
    time,
    speed,
    distrib: ValueDistribution.exp,
  })

  let whiteNoise = await values(errorFreq, valueShape, {
    ctx,
    time,
    speed: speed * 100,
  })

  const [lineData, swerveData, whiteData] = await Promise.all([
    errorLine.read(),
    errorSwerve.read(),
    whiteNoise.read(),
  ])

  // Float32 arithmetic in the order of the Python reference: the offsets are
  // truncated to integers, so a rounding difference changes the pixel read.
  const f32 = Math.fround
  for (let i = 0; i < lineData.length; i++) {
    const el = Math.max(f32(lineData[i] - 0.5), 0)
    const es = Math.max(f32(swerveData[i] - 0.5), 0)
    lineData[i] = f32(el * es)
    whiteData[i] = f32(whiteData[i] * f32(es * 2))
  }

  errorLine = Tensor.fromArray(ctx, lineData, valueShape)
  whiteNoise = Tensor.fromArray(ctx, whiteData, valueShape)

  const errorSum = new Float32Array(lineData.length)
  for (let i = 0; i < lineData.length; i++) {
    errorSum[i] = f32(lineData[i] + whiteData[i])
  }
  let errorTensor = Tensor.fromArray(ctx, errorSum, valueShape)
  errorTensor = await normalize(errorTensor)
  const errorData = await errorTensor.read()

  const src = await tensor.read()
  const out = new Float32Array(h * w * c)
  const shiftScale = f32(0.025)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const shift = Math.trunc(f32(f32(errorData[idx] * w) * shiftScale))
      let srcX = x - shift
      srcX = ((srcX % w) + w) % w
      const srcIdx = (y * w + srcX) * c
      const extra = f32(f32(lineData[idx] * whiteData[idx]) * 4)
      for (let k = 0; k < c; k++) {
        const base = idx * c + k
        const val = src[srcIdx + k]
        out[base] = Math.min(f32(val + extra), 1)
      }
    }
  }
  return Tensor.fromArray(ctx, out, shape)
}
register("scanline_error", scanlineError, {})

export async function crt(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]

  // Horizontal scanlines
  let scanNoise = await values([2, 1], [2, 1, 1], {
    time,
    speed: speed * 0.1,
    splineOrder: InterpolationType.constant,
    ctx,
  })
  scanNoise = await normalize(scanNoise)
  const tileH = Math.max(1, Math.floor(h * 0.125))
  scanNoise = await expandTile(scanNoise, [2, 1, 1], [tileH * 2, w, 1], false)
  scanNoise = await resample(scanNoise, valueShape)
  scanNoise = await lensWarp(scanNoise, valueShape, time, speed)

  const scan = await scanNoise.read()
  const src = await tensor.read()
  const f32 = Math.fround
  const keep = f32(1 - 0.05)
  const mix = f32(0.05)
  const blended = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const s = scan[i]
    for (let k = 0; k < c; k++) {
      const t = src[i * c + k]
      const scanned = f32(f32(t + s) * s)
      blended[i * c + k] = f32(f32(t * keep) + f32(scanned * mix))
    }
  }
  let outTensor = await clamp01(Tensor.fromArray(tensor.ctx, blended, shape))

  if (c === 3) {
    outTensor = await aberration(
      outTensor,
      shape,
      time,
      speed,
      0.0125 + random() * 0.00625,
    )
    outTensor = await randomHue(outTensor, shape, time, speed, 0.125)
    outTensor = await saturation(outTensor, shape, time, speed, 1.125)
  }

  outTensor = await vignette(outTensor, shape, time, speed, 0, random() * 0.175)

  const data = await outTensor.read()
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i]
  const mean = f32(sum / data.length)
  for (let i = 0; i < data.length; i++) {
    data[i] = f32(f32(f32(data[i] - mean) * 1.25) + mean)
  }

  return Tensor.fromArray(outTensor.ctx, data, shape)
}
register("crt", crt, {})

export async function reindex(tensor, shape, time, speed, displacement = 0.5) {
  const [h, w, c] = shape
  const src = await tensor.read()
  let valueTensor = toValueMap(tensor)
  if (valueTensor && typeof valueTensor.then === "function") {
    valueTensor = await valueTensor
  }
  if (
    valueTensor &&
    (valueTensor.shape[0] !== h ||
      valueTensor.shape[1] !== w ||
      valueTensor.shape[2] !== 1)
  ) {
    valueTensor = await resample(valueTensor, [h, w, 1])
    if (valueTensor.shape[2] !== 1) {
      const remap = toValueMap(valueTensor)
      valueTensor =
        remap && typeof remap.then === "function" ? await remap : remap
    }
  }
  valueTensor = await normalize(valueTensor)
  const ref = await valueTensor.read()
  const mod = Math.min(h, w)
  const disp = Math.fround(displacement)
  const out = new Float32Array(h * w * c)
  // Float32 arithmetic and floor modulo, truncated toward zero as the
  // reference casts the offsets to int32.
  const floorMod = (v, m) => {
    const r = v % m
    return r !== 0 && r < 0 ? Math.fround(r + m) : r
  }
  for (let i = 0; i < h * w; i++) {
    const offset = Math.fround(
      Math.fround(Math.fround(ref[i] * disp) * mod) + ref[i],
    )
    const xi = Math.trunc(floorMod(offset, w))
    const yi = Math.trunc(floorMod(offset, h))
    const srcIdx = (yi * w + xi) * c
    const dstIdx = i * c
    for (let k = 0; k < c; k++) {
      out[dstIdx + k] = src[srcIdx + k]
    }
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("reindex", reindex, { displacement: 0.5 })

export async function ripple(
  tensor,
  shape,
  time,
  speed,
  freq = 2,
  displacement = 1,
  kink = 1,
  reference = null,
  splineOrder = InterpolationType.bicubic,
) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  let ref = reference
  if (!ref) {
    const cache = getRippleReferenceCache(ctx)
    const cacheKey = rippleReferenceCacheKey(freq, h, w, splineOrder)
    if (cache.has(cacheKey)) {
      ref = cache.get(cacheKey)
    } else {
      ref = values(freq, [h, w, 1], {
        ctx,
        splineOrder,
        time: 0,
        speed: 1,
      })
      cache.set(cacheKey, ref)
    }
  }
  const seedCache = getRippleRandomSeedCache(ctx)
  const baseSeed = getBaseSeed()
  const seedKey = `${rippleReferenceCacheKey(freq, h, w, splineOrder)}|${baseSeed}`
  let randomSeed = seedCache.get(seedKey)
  if (!Number.isFinite(randomSeed)) {
    randomSeed = rngRandomInt(1, 65536)
    seedCache.set(seedKey, randomSeed)
  }
  const rand = simplexRandom(time, randomSeed, speed)
  let refTensor = ref
  if (refTensor && typeof refTensor.then === "function") {
    refTensor = await refTensor
  }
  let refValue = toValueMap(refTensor)
  if (refValue && typeof refValue.then === "function") {
    refValue = await refValue
  }
  if (refValue.shape[0] !== h || refValue.shape[1] !== w) {
    refValue = await resample(refValue, [h, w, 1])
  }
  const refData = await refValue.read()
  const src = await tensor.read()
  const out = new Float32Array(h * w * c)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const angle = refData[idx] * TAU * kink * rand
      const fx = x + Math.cos(angle) * displacement * w
      const fy = y + Math.sin(angle) * displacement * h
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = x0 + 1
      const y1 = y0 + 1
      const sx = fx - x0
      const sy = fy - y0
      const x0m = ((x0 % w) + w) % w
      const x1m = ((x1 % w) + w) % w
      const y0m = ((y0 % h) + h) % h
      const y1m = ((y1 % h) + h) % h
      for (let k = 0; k < c; k++) {
        const c00 = src[(y0m * w + x0m) * c + k]
        const c10 = src[(y0m * w + x1m) * c + k]
        const c01 = src[(y1m * w + x0m) * c + k]
        const c11 = src[(y1m * w + x1m) * c + k]
        const c0 = c00 * (1 - sx) + c10 * sx
        const c1 = c01 * (1 - sx) + c11 * sx
        out[idx * c + k] = c0 * (1 - sy) + c1 * sy
      }
    }
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("ripple", ripple, {
  freq: 2,
  displacement: 1,
  kink: 1,
  reference: null,
  splineOrder: InterpolationType.bicubic,
})

export async function colorMap(
  tensor,
  shape,
  time,
  speed,
  clut = null,
  horizontal = false,
  displacement = 0.5,
) {
  if (!clut) return tensor
  const [h, w, c] = shape
  const [ch, cw, cc] = clut.shape
  const clutRaw = await clut.read()
  const clutFloat = new Float32Array(clutRaw.length)
  for (let i = 0; i < clutRaw.length; i++) {
    const v = clutRaw[i]
    clutFloat[i] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  let clutTensor = Tensor.fromArray(clut.ctx, clutFloat, [ch, cw, cc])
  if (ch !== h || cw !== w) {
    clutTensor = await resample(clutTensor, [h, w, cc])
  }
  const clutData = await clutTensor.read()

  const valueMap = await toValueMap(tensor)
  const normalized = await normalize(valueMap)
  const refData = await normalized.read()

  const out = new Float32Array(h * w * cc)
  const mod = (n, m) => ((n % m) + m) % m
  // Float32 products truncated toward zero, as the reference casts them to int32.
  const disp = Math.fround(displacement)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const ref = Math.fround(refData[idx] * disp)
      const xOffset = Math.trunc(Math.fround(ref * (w - 1)))
      const yOffset = Math.trunc(Math.fround(ref * (h - 1)))
      const xi = mod(x + xOffset, w)
      const yi = horizontal ? y : mod(y + yOffset, h)
      const srcIdx = (yi * w + xi) * cc
      const outIdx = idx * cc
      for (let k = 0; k < cc; k++) {
        out[outIdx + k] = clutData[srcIdx + k]
      }
    }
  }
  return Tensor.fromArray(tensor.ctx, out, [h, w, cc])
}
register("color_map", colorMap, {
  clut: null,
  horizontal: false,
  displacement: 0.5,
})

export function falseColor(
  tensor,
  shape,
  time,
  speed,
  horizontal = false,
  displacement = 0.5,
) {
  const clut = values(2, shape, { ctx: tensor.ctx, time, speed })
  return normalize(
    colorMap(tensor, shape, time, speed, clut, horizontal, displacement),
  )
}
register("false_color", falseColor, { horizontal: false, displacement: 0.5 })

export async function tint(tensor, shape, time, speed, alpha = 0.5) {
  const [h, w, c] = shape
  if (c < 3) return tensor
  // Consume similar noise to maintain randomness parity with Python impl
  values(3, shape, { ctx: tensor.ctx, time, speed, corners: true })

  const rand1 = random() * 0.333
  const rand2 = random()
  const src = await tensor.read()
  let alphaChan = null
  let rgbData

  if (c === 4) {
    rgbData = new Float32Array(h * w * 3)
    alphaChan = new Float32Array(h * w)
    for (let i = 0; i < h * w; i++) {
      const base = i * 4
      rgbData[i * 3] = src[base]
      rgbData[i * 3 + 1] = src[base + 1]
      rgbData[i * 3 + 2] = src[base + 2]
      alphaChan[i] = src[base + 3]
    }
  } else {
    rgbData = src.slice()
  }

  const colorData = new Float32Array(h * w * 3)
  for (let i = 0; i < h * w; i++) {
    const r = rgbData[i * 3]
    const g = rgbData[i * 3 + 1]
    const b = rgbData[i * 3 + 2]
    colorData[i * 3] = (r * 0.333 + rand1 + rand2) % 1.0
    colorData[i * 3 + 1] = g
    colorData[i * 3 + 2] = b
  }

  const baseTensor = Tensor.fromArray(tensor.ctx, rgbData, [h, w, 3])
  const hsvTensor = await rgbToHsv(baseTensor)
  const hsv = await hsvTensor.read()
  const hsvMix = new Float32Array(h * w * 3)
  for (let i = 0; i < h * w; i++) {
    hsvMix[i * 3] = colorData[i * 3]
    hsvMix[i * 3 + 1] = colorData[i * 3 + 1]
    hsvMix[i * 3 + 2] = hsv[i * 3 + 2]
  }
  const colorized = await hsvToRgb(
    Tensor.fromArray(tensor.ctx, hsvMix, [h, w, 3])
  )
  let out = await blend(baseTensor, colorized, alpha)

  if (c === 4) {
    const outData = await out.read()
    const final = new Float32Array(h * w * 4)
    for (let i = 0; i < h * w; i++) {
      final[i * 4] = outData[i * 3]
      final[i * 4 + 1] = outData[i * 3 + 1]
      final[i * 4 + 2] = outData[i * 3 + 2]
      final[i * 4 + 3] = alphaChan[i]
    }
    out = Tensor.fromArray(tensor.ctx, final, [h, w, 4])
  }

  return out
}
register("tint", tint, { alpha: 0.5 })

export async function valueRefract(
  tensor,
  shape,
  time,
  speed,
  freq = 4,
  distrib = ValueDistribution.center_circle,
  displacement = 0.125,
) {
  const valueShape = [shape[0], shape[1], 1]
  const blendValues = await values(freq, valueShape, {
    ctx: tensor.ctx,
    distrib,
    time,
    speed,
  })
  return refractEffect(
    tensor,
    shape,
    time,
    speed,
    displacement,
    blendValues,
  )
}
register("value_refract", valueRefract, {
  freq: 4,
  distrib: ValueDistribution.center_circle,
  displacement: 0.125,
})

export async function refractEffect(
  tensor,
  shape,
  time,
  speed,
  displacement = 0.5,
  referenceX = null,
  referenceY = null,
  warpFreq = null,
  splineOrder = InterpolationType.bicubic,
  fromDerivative = false,
  signedRange = true,
  yFromOffset = false,
) {
  const [h, w, c] = shape

  const valueShape = [h, w, 1]
  let rx = referenceX
  let ry = referenceY
  if (fromDerivative) {
    // As in the reference: the derivative kernels convolve every channel
    // without normalizing, and the value map below reduces the result.
    rx = await convolve(tensor, shape, time, speed, ValueMask.conv2d_deriv_x, false)
    ry = await convolve(tensor, shape, time, speed, ValueMask.conv2d_deriv_y, false)
  } else if (warpFreq !== null && warpFreq !== undefined) {
    rx = await values(warpFreq, valueShape, {
      ctx: tensor.ctx,
      distrib: ValueDistribution.simplex,
      time,
      speed,
      splineOrder,
    })
    ry = await values(warpFreq, valueShape, {
      ctx: tensor.ctx,
      distrib: ValueDistribution.simplex,
      time,
      speed,
      splineOrder,
    })
  } else {
      if (!rx) rx = tensor
    if (!ry) {
      if (yFromOffset) {
        const xHalf = Math.floor(w * 0.5)
        const yHalf = Math.floor(h * 0.5)
        ry = await offsetTensor(rx, xHalf, yHalf)
      } else {
        rx = await rx
        const rData = await rx.read()
        const cx = new Float32Array(rData.length)
        const cy = new Float32Array(rData.length)
        const tau32 = Math.fround(TAU)
        for (let i = 0; i < rData.length; i++) {
          const ang = Math.fround(rData[i]) * tau32
          const cosVal = Math.fround(Math.cos(ang))
          const sinVal = Math.fround(Math.sin(ang))
          const cx01 = Math.fround(cosVal * 0.5 + 0.5)
          const cy01 = Math.fround(sinVal * 0.5 + 0.5)
          cx[i] = Math.min(Math.max(cx01, 0), 1)
          cy[i] = Math.min(Math.max(cy01, 0), 1)
        }
        rx = Tensor.fromArray(tensor.ctx, cx, rx.shape)
        ry = Tensor.fromArray(tensor.ctx, cy, rx.shape)
      }
    }
  }
  rx = await rx
  ry = await ry
  rx = await toValueMap(rx)
  ry = await toValueMap(ry)
  if (rx.shape[0] !== h || rx.shape[1] !== w) {
    rx = await upsample(rx, h / rx.shape[0])
  }
  if (ry.shape[0] !== h || ry.shape[1] !== w) {
    ry = await upsample(ry, h / ry.shape[0])
  }
  return await refractOp(
    tensor,
    rx,
    ry,
    displacement,
    splineOrder,
    signedRange && !fromDerivative,
  )
}
register("refract_effect", refractEffect, {
  displacement: 0.5,
  referenceX: null,
  referenceY: null,
  warpFreq: null,
  splineOrder: InterpolationType.bicubic,
  fromDerivative: false,
  signedRange: true,
  yFromOffset: false,
})
register("refract", refractEffect, {
  displacement: 0.5,
  referenceX: null,
  referenceY: null,
  warpFreq: null,
  splineOrder: InterpolationType.bicubic,
  fromDerivative: false,
  signedRange: true,
  yFromOffset: false,
})

export function fxaaEffect(tensor, shape, time, speed) {
  return fxaa(tensor)
}
register("fxaa_effect", fxaaEffect, {})
register("fxaa", fxaaEffect, {})

// Float32 arithmetic, as the Python reference computes these values with
// float32 tensors.
function periodicValue(t, v) {
  const delta = Math.fround(Math.fround(t) - Math.fround(v))
  const angle = Math.fround(delta * Math.fround(TAU))
  return Math.fround((sin32(angle) + 1) * 0.5)
}

function makeRots(beh, n, time = 0, speed = 1) {
  const rot = new Float32Array(n)
  // Only the obedient, crosshatch and unruly behaviors draw a base rotation.
  const baseRotation = () =>
    Math.fround(Math.fround(random()) * Math.fround(TAU))
  if (beh === 2) {
    const base = baseRotation()
    const quarterTurn = Math.fround(Math.PI / 2)
    for (let i = 0; i < n; i++) {
      const u = Math.fround(random())
      const turns = Math.floor(Math.fround(u * 100)) % 4
      rot[i] = Math.fround(base + Math.fround(turns * quarterTurn))
    }
  } else if (beh === 3) {
    const base = baseRotation()
    for (let i = 0; i < n; i++) {
      const u = Math.fround(random())
      rot[i] = Math.fround(Math.fround(base + Math.fround(u * 0.25)) - 0.125)
    }
  } else if (beh === 4) {
    const tau = Math.fround(TAU)
    for (let i = 0; i < n; i++) rot[i] = Math.fround(Math.fround(random()) * tau)
  } else if (beh === 5) {
    const q = Math.floor(n * 0.25)
    rot.set(makeRots(1, q, time, speed), 0)
    rot.set(makeRots(2, q, time, speed), q)
    rot.set(makeRots(3, q, time, speed), q * 2)
    rot.set(makeRots(4, n - q * 3, time, speed), q * 3)
  } else if (beh === 10) {
    for (let i = 0; i < n; i++) rot[i] = periodicValue(time * speed, random())
  } else {
    rot.fill(baseRotation())
  }
  return rot
}

export function wormsParams(
  shape,
  density = 4.0,
  stride = 1.0,
  strideDeviation = 0.05,
  behavior = 1,
  time = 0,
  speed = 1,
) {
  // RNG: random→y, random→x, randomNormal→stride, makeRots consumes further RNG
  const [h, w] = shape
  const count = Math.floor(Math.max(w, h) * density)
  const y = new Float32Array(count)
  const x = new Float32Array(count)
  const strideVals = new Float32Array(count)
  const uniformY = randomUniform(count, 0, 1)
  const uniformX = randomUniform(count, 0, 1)
  const strideNoise = randomNormalArray(count, stride, strideDeviation)
  const strideScale = Math.max(w, h) / 1024.0
  for (let i = 0; i < count; i++) {
    y[i] = uniformY[i] * (h - 1) // RNG[1]
    x[i] = uniformX[i] * (w - 1) // RNG[2]
    strideVals[i] = strideNoise[i] * strideScale // RNG[3]
  }
  const rot = makeRots(behavior, count, time, speed)
  return { x: Array.from(x), y: Array.from(y), stride: Array.from(strideVals), rot: Array.from(rot) }
}

function offsetIndexInternal(yArr, height, xArr, width, yOffset, xOffset) {
  const yOff =
    typeof yOffset === 'number'
      ? Math.floor(yOffset)
      : Math.floor(height * 0.5 + random() * height * 0.5)
  const xOff =
    typeof xOffset === 'number'
      ? Math.floor(xOffset)
      : Math.floor(random() * width * 0.5)
  const n = yArr.length
  const oy = new Int32Array(n)
  const ox = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    oy[i] = ((yArr[i] + yOff) % height + height) % height
    ox[i] = ((xArr[i] + xOff) % width + width) % width
  }
  return { y: oy, x: ox }
}

// Round half to even, as tf.math.round does.
function roundHalfEven(value) {
  const r = Math.round(value)
  return r - value === 0.5 && r % 2 !== 0 ? r - 1 : r
}

function wrapFloat(value, size) {
  if (!size) return 0
  const mod = value % size
  if (mod === 0) return 0
  return mod < 0 ? mod + size : mod
}

function offsetTensor(tensor, xOff, yOff) {
  const [h, w, c] = tensor.shape
  if (xOff === 0 && yOff === 0) return tensor
  const srcMaybe = tensor.read()
  if (srcMaybe && typeof srcMaybe.then === "function") {
    return srcMaybe.then((src) => {
      const out = new Float32Array(h * w * c)
      for (let y = 0; y < h; y++) {
        const yy = (((y + yOff) % h) + h) % h
        for (let x = 0; x < w; x++) {
          const xx = (((x + xOff) % w) + w) % w
          const srcIdx = (yy * w + xx) * c
          const dstIdx = (y * w + x) * c
          for (let k = 0; k < c; k++) out[dstIdx + k] = src[srcIdx + k]
        }
      }
      return Tensor.fromArray(tensor.ctx, out, [h, w, c])
    })
  }
  const src = srcMaybe
  const out = new Float32Array(h * w * c)
  for (let y = 0; y < h; y++) {
    const yy = (((y + yOff) % h) + h) % h
    for (let x = 0; x < w; x++) {
      const xx = (((x + xOff) % w) + w) % w
      const srcIdx = (yy * w + xx) * c
      const dstIdx = (y * w + x) * c
      for (let k = 0; k < c; k++) out[dstIdx + k] = src[srcIdx + k]
    }
  }
  return Tensor.fromArray(tensor.ctx, out, [h, w, c])
}

async function centerMaskInternal(
  center,
  edges,
  shape,
  power = 2,
  distMetric = DistanceMetric.chebyshev,
) {
  const [h, w] = shape
  const maskTensor = await singularity(
    null,
    [h, w, 1],
    0,
    1,
    VoronoiDiagramType.range,
    distMetric,
  )
  const mask = await maskTensor.read()
  for (let i = 0; i < mask.length; i++) {
    mask[i] = Math.min(Math.pow(mask[i], power), 1)
  }
  const maskT = Tensor.fromArray(center.ctx, mask, [h, w, 1])
  return await blend(center, edges, maskT)
}

function voronoiColorRegions(tensor, shape, time, speed, xPts, yPts) {
  return voronoi(
    tensor,
    shape,
    time,
    speed,
    VoronoiDiagramType.color_regions,
    0,
    DistanceMetric.euclidean,
    3,
    1.0,
    0.0,
    false,
    true,
    3,
    1,
    PointDistribution.random,
    0,
    false,
    [xPts, yPts, xPts.length],
    true,
  )
}

export async function erosionWorms(
  tensor,
  shape,
  time,
  speed,
  density = 50,
  iterations = 50,
  contraction = 1.0,
  quantize = false,
  alpha = 0.25,
  inverse = false,
  xyBlend = 0,
) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const count = Math.max(0, Math.floor(Math.sqrt(h * w) * density))
  const x = randomUniform(count, 0, 1)
  const y = randomUniform(count, 0, 1)
  const xDir = randomNormalArray(count, 0, 1)
  const yDir = randomNormalArray(count, 0, 1)
  const inertia = randomNormalArray(count, 0.75, 0.25)

  const srcMaybe = tensor.read()
  const src =
    srcMaybe && typeof srcMaybe.then === "function"
      ? await srcMaybe
      : srcMaybe
  const srcData =
    src instanceof Float32Array ? src : Float32Array.from(src || [])

  const blurTensor = maskValues(ValueMask.conv2d_blur)[0]
  const blurFlatMaybe = blurTensor.read()
  const blurFlat =
    blurFlatMaybe && typeof blurFlatMaybe.then === "function"
      ? await blurFlatMaybe
      : blurFlatMaybe
  const [kh, kw] = maskShape(ValueMask.conv2d_blur)
  // The reference scales the kernel by its largest absolute value.
  let kernelScale = 0
  for (let i = 0; i < kh * kw; i++) {
    kernelScale = Math.max(kernelScale, Math.abs(blurFlat[i]))
  }
  const blurKernel = []
  for (let j = 0; j < kh; j++) {
    const row = []
    for (let i = 0; i < kw; i++) {
      row.push(Math.fround(blurFlat[j * kw + i] / kernelScale))
    }
    blurKernel.push(row)
  }

  const convolved = await convolution(tensor, blurKernel)
  let valueTensor = await toValueMap(convolved)
  const valueShape = [h, w, 1]
  if (valueTensor.shape[0] !== h || valueTensor.shape[1] !== w) {
    valueTensor = await resample(valueTensor, valueShape)
  }
  valueTensor = await normalize(valueTensor)
  const valuesMaybe = valueTensor.read()
  const valuesRaw =
    valuesMaybe && typeof valuesMaybe.then === "function"
      ? await valuesMaybe
      : valuesMaybe
  const valuesData =
    valuesRaw instanceof Float32Array
      ? valuesRaw
      : new Float32Array(valuesRaw ?? [])

  // Float32 arithmetic in the reference's operation order, so that worm
  // positions truncate to the same pixels.
  const f32 = Math.fround
  const widthScale = w - 1
  const heightScale = h - 1
  for (let i = 0; i < count; i++) {
    x[i] = f32(x[i] * widthScale)
    y[i] = f32(y[i] * heightScale)
    const len = f32(
      Math.sqrt(f32(f32(xDir[i] * xDir[i]) + f32(yDir[i] * yDir[i]))),
    )
    xDir[i] = f32(xDir[i] / len)
    yDir[i] = f32(yDir[i] / len)
  }

  const startColors = new Float32Array(count * c)
  for (let i = 0; i < count; i++) {
    const xi = ((Math.floor(x[i]) % w) + w) % w
    const yi = ((Math.floor(y[i]) % h) + h) % h
    const base = (yi * w + xi) * c
    for (let k = 0; k < c; k++) {
      startColors[i * c + k] = srcData[base + k]
    }
  }

  const wrap = (value, max) => {
    const mod = value % max
    return mod < 0 ? f32(mod + max) : mod
  }
  const blendScalar = (a, b, t) =>
    f32(f32(a * f32(1 - t)) + f32(b * t))
  const contractionF = f32(contraction)

  const out = new Float32Array(h * w * c)
  // Each iteration scatters into a zeroed buffer and then adds it to the
  // output, as the reference's scatter_nd does.
  const scattered = new Float32Array(h * w * c)
  for (let iter = 0; iter < iterations; iter++) {
    const exposure = f32(1 - Math.abs(1 - (iter / (iterations - 1)) * 2))
    scattered.fill(0)
    for (let j = 0; j < count; j++) {
      const baseXi = Math.trunc(x[j]) % w
      const baseYi = Math.trunc(y[j]) % h
      const idx = baseYi * w + baseXi
      const base = idx * c
      for (let k = 0; k < c; k++) {
        scattered[base + k] = f32(
          scattered[base + k] + f32(startColors[j * c + k] * exposure),
        )
      }

      if (!valuesData || valuesData.length === 0) {
        continue
      }

      const x1 = (baseXi + 1) % w
      const y1 = (baseYi + 1) % h
      const sv = valuesData[idx]
      // The reference reads its "x1" neighbor at (y1, x1).
      const x1v = valuesData[y1 * w + x1]
      const y1v = valuesData[y1 * w + baseXi]
      const x1y1v = valuesData[y1 * w + x1]
      const u = f32(x[j] - Math.floor(x[j]))
      const v = f32(y[j] - Math.floor(y[j]))
      const gX = blendScalar(f32(y1v - sv), f32(x1y1v - x1v), u)
      const gY = blendScalar(f32(x1v - sv), f32(x1y1v - y1v), v)
      const gx = quantize ? Math.floor(gX) : gX
      const gy = quantize ? Math.floor(gY) : gY
      const len = f32(distance(gx, gy, DistanceMetric.euclidean) * contractionF)
      const inertiaVal = inertia[j]
      xDir[j] = blendScalar(xDir[j], f32(gx / len), inertiaVal)
      yDir[j] = blendScalar(yDir[j], f32(gy / len), inertiaVal)
      x[j] = wrap(f32(x[j] + xDir[j]), w)
      y[j] = wrap(f32(y[j] + yDir[j]), h)
    }
    for (let i = 0; i < out.length; i++) {
      out[i] = f32(out[i] + scattered[i])
    }
  }

  let outTensor = Tensor.fromArray(ctx, out, shape)
  outTensor = await clamp01(outTensor)
  if (inverse) {
    const data = await outTensor.read()
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.fround(1 - data[i])
    }
    outTensor = Tensor.fromArray(ctx, data, shape)
  }

  const xyAmount =
    typeof xyBlend === "boolean" ? (xyBlend ? 1 : 0) : xyBlend || 0
  if (xyAmount) {
    const maskData = new Float32Array(h * w)
    for (let i = 0; i < h * w; i++) {
      maskData[i] = Math.fround((valuesData?.[i] || 0) * xyAmount)
    }
    const mask = Tensor.fromArray(ctx, maskData, [h, w, 1])
    const shaded = await shadow(tensor, shape, time, speed)
    const reindexed = await reindex(tensor, shape, time, speed, 1)
    tensor = await blend(shaded, reindexed, mask)
  }

  return await blend(tensor, outTensor, alpha)
}
register("erosion_worms", erosionWorms, {
  density: 50,
  iterations: 50,
  contraction: 1.0,
  quantize: false,
  alpha: 0.25,
  inverse: false,
  xyBlend: 0,
})

export async function worms(
  tensor,
  shape,
  time = 0,
  speed = 1,
  behavior = 1,
  density = 4.0,
  duration = 4.0,
  stride = 1.0,
  strideDeviation = 0.05,
  alpha = 0.5,
  kink = 1.0,
  drunkenness = 0.0,
  quantize = false,
  colors = null,
) {
  tensor = await tensor
  colors = colors ? await colors : null
  const [h, w, c] = shape
  const count = Math.floor(Math.max(w, h) * density)
  const wormsY = randomUniform(count, 0, 1)
  const wormsX = randomUniform(count, 0, 1)
  const wormsStride = randomNormalArray(count, stride, strideDeviation)
  const strideScale = Math.max(w, h) / 1024.0
  for (let i = 0; i < count; i++) {
    wormsY[i] = Math.fround(wormsY[i] * (h - 1))
    wormsX[i] = Math.fround(wormsX[i] * (w - 1))
    wormsStride[i] = Math.fround(wormsStride[i] * strideScale)
  }
  const src = colors
    ? colors.read
      ? await colors.read()
      : colors
    : await tensor.read()
  const wormColors = new Float32Array(count * c)
  for (let i = 0; i < count; i++) {
    const xi = Math.floor(wormsX[i])
    const yi = Math.floor(wormsY[i])
    const base = (yi * w + xi) * c
    for (let k = 0; k < c; k++) {
      wormColors[i * c + k] = src[base + k]
    }
  }
  const wormsRot = makeRots(behavior, count, time, speed)

  const valueTensor = await normalize(await toValueMap(tensor))
  const valueDataMaybe = valueTensor.read()
  const valueData =
    valueDataMaybe && typeof valueDataMaybe.then === "function"
      ? await valueDataMaybe
      : valueDataMaybe
  const valueChannels = valueTensor.shape[2] || 1
  const indexArr = new Float32Array(h * w)
  const tauF = Math.fround(TAU)
  const kinkF = Math.fround(kink)
  for (let i = 0; i < h * w; i++) {
    indexArr[i] = Math.fround(Math.fround(valueData[i * valueChannels] * tauF) * kinkF)
  }
  const iterations = Math.floor(Math.sqrt(Math.min(w, h)) * duration)
  const out = new Float32Array(h * w * c)
  for (let iter = 0; iter < iterations; iter++) {
    if (drunkenness) {
      const start = Math.floor(
        Math.min(h, w) * time * speed + iter * speed * 10,
      )
      const drunk = Math.fround(drunkenness)
      const pi = Math.fround(Math.PI)
      for (let i = 0; i < count; i++) {
        const swing = Math.fround(periodicValue(start, random()) * 2 - 1)
        wormsRot[i] = Math.fround(
          wormsRot[i] + Math.fround(Math.fround(swing * drunk) * pi),
        )
      }
    }
    const exposure =
      iterations > 1 ? 1 - Math.abs(1 - (iter / (iterations - 1)) * 2) : 1
    for (let i = 0; i < count; i++) {
      const yi = Math.floor(wrapFloat(wormsY[i], h))
      const xi = Math.floor(wrapFloat(wormsX[i], w))
      const idx = yi * w + xi
      const base = idx * c
      for (let k = 0; k < c; k++) {
        out[base + k] += wormColors[i * c + k] * exposure
      }
      let next = Math.fround(indexArr[idx] + wormsRot[i])
      if (quantize) next = roundHalfEven(next)
      wormsY[i] = wrapFloat(
        Math.fround(wormsY[i] + Math.fround(cos32(next) * wormsStride[i])),
        h,
      )
      wormsX[i] = wrapFloat(
        Math.fround(wormsX[i] + Math.fround(sin32(next) * wormsStride[i])),
        w,
      )
    }
  }
  let outTensor = Tensor.fromArray(tensor.ctx, out, shape)
  outTensor = await normalize(outTensor)
  const d = await outTensor.read()
  for (let i = 0; i < d.length; i++) d[i] = Math.sqrt(d[i])
  outTensor = Tensor.fromArray(outTensor.ctx, d, shape)
  return blend(tensor, outTensor, alpha)
}
register("worms", worms, {
  behavior: 1,
  density: 4.0,
  duration: 4.0,
  stride: 1.0,
  strideDeviation: 0.05,
  alpha: 0.5,
  kink: 1.0,
  drunkenness: 0.0,
  quantize: false,
  colors: null,
})

export async function wormhole(
  tensor,
  shape,
  time,
  speed,
  kink = 1.0,
  inputStride = 1.0,
  alpha = 1.0,
) {
  const [h, w, c] = shape
  const valueTensorMaybe = toValueMap(tensor)
  const valueTensor =
    valueTensorMaybe && typeof valueTensorMaybe.then === "function"
      ? await valueTensorMaybe
      : valueTensorMaybe
  const valueDataMaybe = valueTensor.read()
  const valueRaw =
    valueDataMaybe && typeof valueDataMaybe.then === "function"
      ? await valueDataMaybe
      : valueDataMaybe
  const valueChannels = valueTensor.shape[2] || 1
  const valuesArr = new Float32Array(h * w)
  if (valueChannels === 1) {
    if (valueRaw instanceof Float32Array) {
      valuesArr.set(valueRaw)
    } else {
      for (let i = 0; i < h * w; i++) valuesArr[i] = valueRaw[i] ?? 0
    }
  } else {
    for (let i = 0; i < h * w; i++) {
      valuesArr[i] = valueRaw[i * valueChannels] ?? 0
    }
  }
  const stride = 1024 * inputStride
  const srcMaybe = tensor.read()
  const src =
    srcMaybe && typeof srcMaybe.then === "function"
      ? await srcMaybe
      : srcMaybe
  // Float32 arithmetic in the reference's operation order, so that the
  // truncated offsets land on the same pixels.
  const tauF = Math.fround(TAU)
  const kinkF = Math.fround(kink)
  const strideF = Math.fround(stride)
  const xArr = new Int32Array(h * w)
  const yArr = new Int32Array(h * w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const deg = Math.fround(Math.fround(valuesArr[idx] * tauF) * kinkF)
      const xo = Math.fround(Math.fround(cos32(deg) + 1) * strideF)
      const yo = Math.fround(Math.fround(sin32(deg) + 1) * strideF)
      xArr[idx] = Math.trunc(Math.fround(x + xo)) % w
      yArr[idx] = Math.trunc(Math.fround(y + yo)) % h
    }
  }
  const offs = offsetIndexInternal(yArr, h, xArr, w)
  const out = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const dest = (offs.y[i] * w + offs.x[i]) * c
    const lum = valuesArr[i]
    const l2 = Math.fround(lum * lum)
    const base = i * c
    for (let k = 0; k < c; k++) {
      out[dest + k] += Math.fround(src[base + k] * l2)
    }
  }
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < out.length; i++) {
    if (out[i] < min) min = out[i]
    if (out[i] > max) max = out[i]
  }
  if (max > min) {
    const range = Math.fround(max - min)
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.fround(out[i] - min) / range
    }
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.sqrt(out[i])
  }
  const outTensor = Tensor.fromArray(tensor.ctx, out, shape)
  return await blend(tensor, outTensor, alpha)
}
register("wormhole", wormhole, { kink: 1.0, inputStride: 1.0, alpha: 1.0 })

export async function vignette(
  tensor,
  shape,
  time,
  speed,
  brightness = 0.0,
  alpha = 1.0,
) {
  const [h, w, c] = shape
  const norm = await normalize(tensor)
  const ctx = tensor.ctx
  const brightnessData = new Float32Array(h * w * c)
  brightnessData.fill(brightness)
  const brightnessTensor = Tensor.fromArray(ctx, brightnessData, shape)
  const edges = await centerMaskInternal(
    norm,
    brightnessTensor,
    shape,
    2,
    DistanceMetric.euclidean,
  )
  return await blend(norm, edges, alpha)
}
register("vignette", vignette, { brightness: 0.0, alpha: 1.0 })

export async function vaseline(tensor, shape, time, speed, alpha = 1.0) {
  const blurred = await bloom(tensor, shape, 0, 1, 1.0)
  const masked = await centerMaskInternal(tensor, blurred, shape)
  return await blend(tensor, masked, alpha)
}
register("vaseline", vaseline, { alpha: 1.0 })

export async function lightLeak(tensor, shape, time, speed, alpha = 0.25) {
  // randomInt() returns values inclusive of both endpoints. Clamp to
  // length - 1 so the selected index matches Python's rng.random_int
  // behavior and never exceeds the array bounds. gridMembers keeps the
  // reference's enum order.
  const distrib = gridMembers[randomInt(0, gridMembers.length - 1)]
  const [xPts, yPts] = pointCloud(6, {
    distrib,
    drift: 0.05,
    shape,
    time,
    speed,
  })
  let leak = await voronoiColorRegions(tensor, shape, time, speed, xPts, yPts)
  leak = await wormhole(leak, shape, time, speed, 1.0, 0.25, 1.0)
  leak = await bloom(leak, shape, time, speed, 1.0)
  leak = await screenBlend(tensor, leak, shape)
  leak = await centerMaskInternal(
    tensor,
    leak,
    shape,
    undefined,
    DistanceMetric.octagram,
  )
  const blended = await blend(tensor, leak, alpha)
  // ``vaseline`` ignores the temporal parameters but expects them for
  // registry consistency.
  return await vaseline(blended, shape, 0, 1, alpha)
}
register("lightLeak", lightLeak, { alpha: 0.25 })
register("light_leak", lightLeak, { alpha: 0.25 })

export async function dither(tensor, shape, time, speed, levels = 2) {
  const [h, w, c] = shape
  const noise = await values(Math.max(h, w), [h, w, 1], {
    ctx: tensor.ctx,
    time,
    seed: 0,
    speed: speed * 1000,
  })
  const nMaybe = noise && typeof noise.read === 'function' ? noise.read() : null
  const n = nMaybe && typeof nMaybe.then === 'function' ? await nMaybe : nMaybe
  const src = await tensor.read()
  const out = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const d = n[i] - 0.5
    for (let k = 0; k < c; k++) {
      let v = src[i * c + k] + d / levels
      v = Math.floor(Math.min(1, Math.max(0, v)) * levels) / levels
      out[i * c + k] = v
    }
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("dither", dither, { levels: 2 })

export function grain(tensor, shape, time, speed, alpha = 0.25) {
  const [h, w] = shape
  const alphaVal = Number.isFinite(alpha) ? alpha : 0.25
  if (alphaVal <= 0) {
    return tensor
  }
  const timeVal = Number.isFinite(time) ? time : 0
  const speedVal = Number.isFinite(speed) ? speed : 1
  const noiseSpeed = speedVal * 100
  const buildNoise = () =>
    values([h, w], [h, w, 1], {
      ctx: tensor.ctx,
      time: timeVal,
      speed: noiseSpeed,
    })

  return (async () => {
    const noiseTensor = await buildNoise()
    return blend(tensor, noiseTensor, alphaVal)
  })()
}
register("grain", grain, { alpha: 0.25 })

export async function snow(tensor, shape, time, speed, alpha = 0.25) {
  const [h, w] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]
  const timeVal = Number.isFinite(time) ? time : 0
  const speedVal = Number.isFinite(speed) ? speed : 1
  const scaledSpeed = speedVal * 100

  const staticNoise = await values([h, w], valueShape, {
    ctx,
    time: timeVal,
    speed: scaledSpeed,
    splineOrder: InterpolationType.constant,
  })
  const limiter = await values([h, w], valueShape, {
    ctx,
    time: timeVal,
    speed: scaledSpeed,
    distrib: ValueDistribution.exp,
    splineOrder: InterpolationType.constant,
  })

  const limiterDataMaybe = limiter.read()
  const limiterData =
    limiterDataMaybe && typeof limiterDataMaybe.then === "function"
      ? await limiterDataMaybe
      : limiterDataMaybe

  const scaled = new Float32Array(limiterData.length)

  if (typeof alpha === "number") {
    for (let i = 0; i < scaled.length; i++) {
      scaled[i] = limiterData[i] * alpha
    }
    const mask = Tensor.fromArray(ctx, scaled, valueShape)
    return blend(tensor, staticNoise, mask)
  }

  let alphaTensor = alpha
  if (alphaTensor && typeof alphaTensor.then === "function") {
    alphaTensor = await alphaTensor
  }

  if (!alphaTensor || typeof alphaTensor.read !== "function") {
    const mask = Tensor.fromArray(ctx, limiterData.slice(), valueShape)
    return blend(tensor, staticNoise, mask)
  }

  const alphaDataMaybe = alphaTensor.read()
  const alphaData =
    alphaDataMaybe && typeof alphaDataMaybe.then === "function"
      ? await alphaDataMaybe
      : alphaDataMaybe
  const alphaChannels = alphaTensor.shape?.[2] || 1
  const pixelCount = alphaData ? alphaData.length / alphaChannels : 0
  for (let i = 0; i < scaled.length; i++) {
    const idx = alphaData && pixelCount ? Math.min(i, pixelCount - 1) : i
    const alphaVal =
      alphaData && pixelCount ? alphaData[idx * alphaChannels] : 0
    scaled[i] = limiterData[i] * alphaVal
  }
  const mask = Tensor.fromArray(ctx, scaled, valueShape)
  return blend(tensor, staticNoise, mask)
}
register("snow", snow, { alpha: 0.25 })

// Emulates the float32 kernel behind tf.image.adjust_saturation, which clamps
// the scaled saturation to [0, 1].
export function saturation(tensor, shape, time, speed, amount = 0.75) {
  if (shape[2] < 3) return tensor
  const [h, w, c] = tensor.shape
  const f32 = Math.fround
  const scale = f32(amount)
  return withTensorData(tensor, (src) => {
    const out = new Float32Array(h * w * 3)
    for (let i = 0; i < h * w; i++) {
      const r = src[i * c]
      const g = src[i * c + 1]
      const b = src[i * c + 2]
      const v = Math.max(r, Math.max(g, b))
      const range = f32(v - Math.min(r, Math.min(g, b)))
      let s = v > 0 ? f32(range / v) : 0
      const norm = f32(1 / f32(6 * range))
      let hue
      if (r === v) {
        hue = f32(norm * f32(g - b))
      } else if (g === v) {
        hue = f32(f32(norm * f32(b - r)) + 2.0 / 6.0)
      } else {
        hue = f32(f32(norm * f32(r - g)) + 4.0 / 6.0)
      }
      if (range <= 0) hue = 0
      if (hue < 0) hue = f32(hue + 1)
      s = Math.min(1, Math.max(0, f32(s * scale)))
      const chroma = f32(s * v)
      const m = f32(v - chroma)
      const dh = f32(hue * 6)
      const category = Math.trunc(dh)
      let fmodu = dh
      while (fmodu <= 0) fmodu = f32(fmodu + 2)
      while (fmodu >= 2) fmodu = f32(fmodu - 2)
      const x = f32(chroma * f32(1 - Math.abs(f32(fmodu - 1))))
      let rr = 0
      let gg = 0
      let bb = 0
      switch (category) {
        case 0:
          rr = chroma
          gg = x
          break
        case 1:
          rr = x
          gg = chroma
          break
        case 2:
          gg = chroma
          bb = x
          break
        case 3:
          gg = x
          bb = chroma
          break
        case 4:
          rr = x
          bb = chroma
          break
        case 5:
          rr = chroma
          bb = x
          break
        default:
          break
      }
      out[i * 3] = f32(rr + m)
      out[i * 3 + 1] = f32(gg + m)
      out[i * 3 + 2] = f32(bb + m)
    }
    return Tensor.fromArray(tensor.ctx, out, [h, w, 3])
  })
}
register("saturation", saturation, { amount: 0.75 })
register("adjust_saturation", saturation, { amount: 0.75 })

// Provide snake_case aliases to mirror the Python API for parity tests.
export const adjust_saturation = saturation

export function randomHue(tensor, shape, time, speed, range = 0.05) {
  const shift = random() * range * 2 - range
  return adjustHue(tensor, shift)
}
register("random_hue", randomHue, { range: 0.05 })

// The hue shift that tf.image.random_hue(image, maxDelta, seed=seed) applies
// when no global seed is set. TensorFlow draws it from a Philox4x32-10
// generator keyed by its default graph seed (87654321), with the operation
// seed (truncated to 31 bits) as the high counter word.
function seededHueDelta(seed, maxDelta) {
  const M = 0xffffffffn
  const opSeed = BigInt(seed % 0x7fffffff)
  let c = [0n, 0n, opSeed & M, (opSeed >> 32n) & M]
  let k = [87654321n, 0n]
  for (let round = 0; round < 10; round++) {
    const p0 = 0xd2511f53n * c[0]
    const p1 = 0xcd9e8d57n * c[2]
    c = [
      ((p1 >> 32n) ^ c[1] ^ k[0]) & M,
      p1 & M,
      ((p0 >> 32n) ^ c[3] ^ k[1]) & M,
      p0 & M,
    ]
    k = [(k[0] + 0x9e3779b9n) & M, (k[1] + 0xbb67ae85n) & M]
  }
  const bits = new Uint32Array([(127 << 23) | (Number(c[0]) & 0x7fffff)])
  const unit = Math.fround(new Float32Array(bits.buffer)[0] - 1)
  const lo = Math.fround(-maxDelta)
  const span = Math.fround(Math.fround(maxDelta) - lo)
  return Math.fround(Math.fround(unit * span) + lo)
}

export function normalizeEffect(tensor, shape, time, speed) {
  return normalize(tensor)
}
register("normalize", normalizeEffect, {})

export async function adjustBrightness(tensor, shape, time, speed, amount = 0.125) {
  const [h, w, c] = shape
  const src = await tensor.read()
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) {
    const v = src[i] + amount
    out[i] = v < -1 ? -1 : v > 1 ? 1 : v
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("adjust_brightness", adjustBrightness, { amount: 0.125 })

export const adjust_brightness = adjustBrightness

// tf.image.adjust_contrast, without clamping. TensorFlow sums each channel
// by folding the image in half repeatedly (float32), then scales the sum by
// 1 / pixelCount.
function imageAdjustContrast(src, pixelCount, c, amount) {
  const sums = Float32Array.from(src.subarray(0, pixelCount * c))
  let remaining = pixelCount
  while (remaining > 1) {
    const right = Math.floor(remaining / 2)
    const left = remaining - right
    for (let i = 0; i < right * c; i++) {
      sums[i] = Math.fround(sums[i] + sums[left * c + i])
    }
    remaining = left
  }
  const scaling = Math.fround(1 / pixelCount)
  const mean = new Float32Array(c)
  for (let ch = 0; ch < c; ch++) {
    mean[ch] = Math.fround(sums[ch] * scaling)
  }
  const factor = Math.fround(amount)
  const out = new Float32Array(pixelCount * c)
  for (let i = 0; i < pixelCount; i++) {
    for (let ch = 0; ch < c; ch++) {
      const idx = i * c + ch
      const m = mean[ch]
      out[idx] = Math.fround(m + Math.fround(factor * Math.fround(src[idx] - m)))
    }
  }
  return out
}

export async function adjustContrast(tensor, shape, time, speed, amount = 1.25) {
  const [h, w, c] = shape
  const src = await tensor.read()
  const out = imageAdjustContrast(src, h * w, c, amount)
  for (let i = 0; i < out.length; i++) {
    const v = out[i]
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("adjust_contrast", adjustContrast, { amount: 1.25 })

export const adjust_contrast = adjustContrast

export function adjustHueEffect(tensor, shape, time, speed, amount = 0.25) {
  if (shape[2] < 3 || amount === 0 || amount === 1 || amount === null)
    return tensor
  const result = adjustHue(tensor, amount)
  return result
}
register("adjust_hue", adjustHueEffect, { amount: 0.25 })

export const adjust_hue = adjustHueEffect

export function ridgeEffect(tensor, shape, time, speed) {
  return ridge(tensor)
}
register("ridge", ridgeEffect, {})

export async function sine(
  tensor,
  shape,
  time,
  speed,
  amount = 1.0,
  rgb = false,
) {
  const [h, w, c] = shape
  const src = await tensor.read()
  const out = new Float32Array(h * w * c)
  const ns = (v) => (Math.sin(v) + 1) * 0.5
  for (let i = 0; i < h * w; i++) {
    const base = i * c
    if (c === 1) {
      out[i] = ns(src[i] * amount)
    } else if (c === 2) {
      out[base] = ns(src[base] * amount)
      out[base + 1] = src[base + 1]
    } else if (c === 3) {
      if (rgb) {
        out[base] = ns(src[base] * amount)
        out[base + 1] = ns(src[base + 1] * amount)
        out[base + 2] = ns(src[base + 2] * amount)
      } else {
        out[base] = src[base]
        out[base + 1] = src[base + 1]
        out[base + 2] = ns(src[base + 2] * amount)
      }
    } else if (c === 4) {
      if (rgb) {
        out[base] = ns(src[base] * amount)
        out[base + 1] = ns(src[base + 1] * amount)
        out[base + 2] = ns(src[base + 2] * amount)
        out[base + 3] = src[base + 3]
      } else {
        out[base] = src[base]
        out[base + 1] = src[base + 1]
        out[base + 2] = ns(src[base + 2] * amount)
        out[base + 3] = src[base + 3]
      }
    }
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}
register("sine", sine, { amount: 1.0, rgb: false })

export async function blur(
  tensor,
  shape,
  time,
  speed,
  amount = 10.0,
  splineOrder = InterpolationType.bicubic,
) {
  const [h, w, c] = shape
  const newShape = [
    Math.max(1, Math.floor(h / amount)),
    Math.max(1, Math.floor(w / amount)),
    c,
  ]
  const downsampled = await proportionalDownsample(tensor, shape, newShape)
  const scaled = await scaleTensor(downsampled, 4.0)
  return await resample(scaled, shape, splineOrder)
}
register("blur", blur, {
  amount: 10.0,
  splineOrder: InterpolationType.bicubic,
})

export async function wobble(tensor, shape, time, speed) {
  const xOffset = Math.floor(
    simplexRandom(time, undefined, speed * 0.5) * shape[1],
  )
  const yOffset = Math.floor(
    simplexRandom(time, undefined, speed * 0.5) * shape[0],
  )
  const [h, w, c] = shape
  return await offsetTensor(tensor, xOffset, yOffset)
}
register("wobble", wobble, {})

export async function reverb(
  tensor,
  shape,
  time,
  speed,
  octaves = 2,
  iterations = 1,
  ridges = true,
) {
  if (!octaves) return tensor
  const [h, w, c] = shape
  const reference = ridges ? await ridge(tensor) : tensor
  const base = await reference.read()
  const outData = base.slice()
  for (let i = 0; i < iterations; i++) {
    for (let octave = 1; octave <= octaves; octave++) {
      const mult = 2 ** octave
      const nh = Math.floor(h / mult) || 1
      const nw = Math.floor(w / mult) || 1
      if (nh === 0 || nw === 0) break
      const octaveShape = [nh, nw, c]
      let layer = proportionalDownsample(reference, shape, octaveShape)
      layer = await expandTileInternal(layer, octaveShape, shape)
      const layerData = await layer.read()
      for (let j = 0; j < outData.length; j++) {
        outData[j] += layerData[j] / mult
      }
    }
  }
  const outTensor = Tensor.fromArray(tensor.ctx, outData, shape)
  return normalize(outTensor)
}
register("reverb", reverb, { octaves: 2, iterations: 1, ridges: true })

async function expandTileInternal(
  tensor,
  inputShape,
  outputShape,
  withOffset = true,
) {
  const [ih, iw, c] = inputShape
  const [oh, ow] = outputShape
  const source = tensor && typeof tensor.then === "function" ? await tensor : tensor
  if (!source) {
    throw new Error("expandTileInternal requires a tensor input")
  }
  const dataMaybe = source.read ? source.read() : null
  const srcData = dataMaybe && typeof dataMaybe.then === "function" ? await dataMaybe : dataMaybe
  if (!srcData) {
    throw new Error("Failed to read tensor data for expandTileInternal")
  }
  const out = new Float32Array(oh * ow * c)
  const xOffset = withOffset ? Math.floor(iw / 2) : 0
  const yOffset = withOffset ? Math.floor(ih / 2) : 0
  const wrap = (index, size) => {
    if (size <= 0) return 0
    const mod = index % size
    return mod < 0 ? mod + size : mod
  }
  for (let y = 0; y < oh; y++) {
    const sy = wrap(y + yOffset, ih)
    for (let x = 0; x < ow; x++) {
      const sx = wrap(x + xOffset, iw)
      const srcBase = (sy * iw + sx) * c
      const dstBase = (y * ow + x) * c
      for (let k = 0; k < c; k++) {
        out[dstBase + k] = srcData[srcBase + k]
      }
    }
  }
  return Tensor.fromArray(source.ctx, out, [oh, ow, c])
}

async function rotate2D(tensor, shape, angle) {
  const [h, w, c] = shape
  const srcTensor = tensor && typeof tensor.then === "function" ? await tensor : tensor
  if (!srcTensor) {
    throw new Error("rotate2D requires a tensor input")
  }
  const dataMaybe = srcTensor.read ? srcTensor.read() : null
  const srcData = dataMaybe && typeof dataMaybe.then === "function" ? await dataMaybe : dataMaybe
  if (!srcData) {
    throw new Error("Failed to read tensor data for rotate2D")
  }
  const out = new Float32Array(h * w * c)
  const f = Math.fround
  const cosA = f(Math.cos(angle))
  const sinA = f(Math.sin(angle))
  for (let y = 0; y < h; y++) {
    const yNorm = f(f(y / h) - 0.5)
    for (let x = 0; x < w; x++) {
      const xNorm = f(f(x / w) - 0.5)
      const srcXNorm = f(f(cosA * xNorm) + f(sinA * yNorm) + 0.5)
      const srcYNorm = f(f(-sinA * xNorm) + f(cosA * yNorm) + 0.5)
      let sx = Math.trunc(f(srcXNorm * w)) % w
      let sy = Math.trunc(f(srcYNorm * h)) % h
      if (sx < 0) sx += w
      if (sy < 0) sy += h
      const srcBase = (sy * w + sx) * c
      const dstBase = (y * w + x) * c
      for (let k = 0; k < c; k++) {
        out[dstBase + k] = srcData[srcBase + k]
      }
    }
  }
  return Tensor.fromArray(srcTensor.ctx, out, [h, w, c])
}

async function cropTensor(tensor, inputShape, outputShape) {
  const [H, W, c] = inputShape
  const [h, w] = outputShape
  const srcTensor = tensor && typeof tensor.then === "function" ? await tensor : tensor
  if (!srcTensor) {
    throw new Error("cropTensor requires a tensor input")
  }
  const srcMaybe = srcTensor.read ? srcTensor.read() : null
  const src = srcMaybe && typeof srcMaybe.then === "function" ? await srcMaybe : srcMaybe
  if (!src) {
    throw new Error("Failed to read tensor data for cropTensor")
  }
  const out = new Float32Array(h * w * c)
  const yOff = Math.floor((H - h) / 2)
  const xOff = Math.floor((W - w) / 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcBase = ((yOff + y) * W + (xOff + x)) * c
      const dstBase = (y * w + x) * c
      for (let k = 0; k < c; k++) out[dstBase + k] = src[srcBase + k]
    }
  }
  return Tensor.fromArray(srcTensor.ctx, out, [h, w, c])
}

async function resizeWithCropOrPad(tensor, inputShape, size) {
  const [h, w, c] = inputShape
  const target = Math.max(1, Math.trunc(size ?? 0))
  if (target === h && target === w) {
    return tensor
  }
  const srcTensor = tensor && typeof tensor.then === "function" ? await tensor : tensor
  if (!srcTensor) {
    throw new Error("resizeWithCropOrPad requires a tensor input")
  }
  const dataMaybe = srcTensor.read ? srcTensor.read() : null
  const srcData = dataMaybe && typeof dataMaybe.then === "function" ? await dataMaybe : dataMaybe
  if (!srcData) {
    throw new Error("Failed to read tensor data for resizeWithCropOrPad")
  }
  const out = new Float32Array(target * target * c)
  const halfDiffY = (h - target) / 2
  const halfDiffX = (w - target) / 2
  const yOffset = halfDiffY >= 0 ? Math.floor(halfDiffY) : Math.ceil(halfDiffY)
  const xOffset = halfDiffX >= 0 ? Math.floor(halfDiffX) : Math.ceil(halfDiffX)
  for (let y = 0; y < target; y++) {
    const srcY = y + yOffset
    const rowBase = (y * target) * c
    for (let x = 0; x < target; x++) {
      const srcX = x + xOffset
      const dstBase = rowBase + x * c
      if (srcY < 0 || srcY >= h || srcX < 0 || srcX >= w) {
        for (let k = 0; k < c; k++) {
          out[dstBase + k] = 0
        }
        continue
      }
      const srcBase = (srcY * w + srcX) * c
      for (let k = 0; k < c; k++) {
        out[dstBase + k] = srcData[srcBase + k]
      }
    }
  }
  return Tensor.fromArray(srcTensor.ctx, out, [target, target, c])
}

export async function squareCropAndResize(tensor, shape, length = 1024) {
  const [h, w, rawChannels] = shape
  const channels = Math.max(1, rawChannels ?? tensor.shape?.[2] ?? 1)
  const have = Math.min(h, w)
  if (h === w && have === length) {
    return tensor
  }
  if (have <= 0 || channels <= 0) {
    return tensor
  }
  let out = tensor
  if (h !== w) {
    out = await cropTensor(out, [h, w, channels], [have, have])
  }
  if (have !== length) {
    out = await resample(out, [length, length, channels])
  }
  return out
}

export async function rotate(tensor, shape, time, speed, angle = null) {
  if (angle === null || angle === undefined) angle = random() * 360
  const [h, w, c] = shape
  const want = Math.max(h, w) * 2
  let padded = await expandTileInternal(tensor, shape, [want, want, c])
  padded = await rotate2D(padded, padded.shape, (angle * Math.PI) / 180)
  return await cropTensor(padded, padded.shape, shape)
}
register("rotate", rotate, { angle: 0 })

async function _pixelSort(tensor, shape, angle, darkest) {
  const ctx = tensor.ctx
  const [h, w, c] = shape
  const srcMaybe = tensor.read()
  const srcData =
    srcMaybe && typeof srcMaybe.then === "function"
      ? await srcMaybe
      : srcMaybe
  let baseData
  if (srcData instanceof Float32Array) {
    baseData = srcData.slice()
  } else if (srcData) {
    baseData = Float32Array.from(srcData)
  } else {
    baseData = new Float32Array(h * w * c)
  }
  for (let i = 0; i < baseData.length; i++) {
    baseData[i] = Math.fround(baseData[i] ?? 0)
  }
  if (darkest) {
    for (let i = 0; i < baseData.length; i++) {
      baseData[i] = Math.fround(1 - baseData[i])
    }
  }
  const baseTensor = Tensor.fromArray(ctx, baseData, shape)
  let working = baseTensor
  const want = Math.max(h, w) * 2
  working = await resizeWithCropOrPad(working, shape, want)
  if (angle !== false) {
    working = await rotate2D(working, [want, want, c], (angle * Math.PI) / 180)
  }
  const dataMaybe = await working.read()
  const workingData =
    dataMaybe instanceof Float32Array
      ? dataMaybe
      : Float32Array.from(dataMaybe ?? [])
  let cachedValuesData = null
  const loadValuesData = async () => {
    if (cachedValuesData) {
      return cachedValuesData
    }
    let valueTensor = toValueMap(working)
    if (valueTensor && typeof valueTensor.then === "function") {
      valueTensor = await valueTensor
    }
    if (!valueTensor) {
      cachedValuesData = new Float32Array(want * want)
      return cachedValuesData
    }
    let valuesMaybe = valueTensor.read ? valueTensor.read() : null
    if (valuesMaybe && typeof valuesMaybe.then === "function") {
      valuesMaybe = await valuesMaybe
    }
    let valuesData
    if (valuesMaybe instanceof Float32Array) {
      valuesData = valuesMaybe
    } else if (valuesMaybe) {
      valuesData = Float32Array.from(valuesMaybe)
    } else {
      valuesData = new Float32Array(want * want)
    }
    if (valuesData.length < want * want) {
      const resized = new Float32Array(want * want)
      resized.set(valuesData.subarray(0, valuesData.length))
      valuesData = resized
    }
    cachedValuesData = valuesData
    return cachedValuesData
  }
  const finalizeOutput = async (tensorOut) => {
    const sortedMaybe = tensorOut.read()
    const sortedData =
      sortedMaybe && typeof sortedMaybe.then === "function"
        ? await sortedMaybe
        : sortedMaybe
    const sortedArr =
      sortedData instanceof Float32Array
        ? sortedData
        : sortedData
        ? Float32Array.from(sortedData)
        : new Float32Array(h * w * c)
    const out = new Float32Array(h * w * c)
    for (let i = 0; i < out.length; i++) {
      const baseVal = Math.fround(baseData[i] ?? 0)
      const sortedVal = Math.fround(sortedArr[i] ?? 0)
      const maxVal = Math.max(baseVal, sortedVal)
      out[i] = Math.fround(darkest ? 1 - maxVal : maxVal)
    }
    return Tensor.fromArray(ctx, out, shape)
  }
  const valuesData = await loadValuesData()
  const sorted = new Float32Array(want * want * c)
  const order = new Array(want)
  for (let y = 0; y < want; y++) {
    const rowOffset = y * want
    let shift = 0
    let maxVal = -Infinity
    for (let x = 0; x < want; x++) {
      const v = Math.fround(valuesData[rowOffset + x] ?? 0)
      if (v > maxVal) {
        maxVal = v
        shift = x
      }
    }
    const sortedRow = new Float32Array(want * c)
    for (let k = 0; k < c; k++) {
      for (let i = 0; i < want; i++) order[i] = i
      order.sort(
        (a, b) =>
          (workingData[(rowOffset + b) * c + k] ?? 0) -
          (workingData[(rowOffset + a) * c + k] ?? 0),
      )
      for (let pos = 0; pos < want; pos++) {
        const srcIndex = order[pos]
        const srcBase = (rowOffset + srcIndex) * c
        const value = workingData[srcBase + k] ?? 0
        sortedRow[pos * c + k] = Math.fround(value)
      }
    }
    for (let x = 0; x < want; x++) {
      const srcPos = (x - shift + want) % want
      const dstBase = (rowOffset + x) * c
      const srcBase = srcPos * c
      for (let k = 0; k < c; k++) {
        sorted[dstBase + k] = sortedRow[srcBase + k]
      }
    }
  }
  let sortedTensor = Tensor.fromArray(ctx, sorted, [want, want, c])
  if (angle !== false) {
    sortedTensor = await rotate2D(
      sortedTensor,
      [want, want, c],
      (-angle * Math.PI) / 180,
    )
  }
  sortedTensor = await cropTensor(sortedTensor, [want, want, c], shape)
  return finalizeOutput(sortedTensor)
}

export async function pixelSort(
  tensor,
  shape,
  time,
  speed,
  angled = false,
  darkest = false,
) {
  let angle = false
  if (angled) angle = angled === true ? random() * 360 : angled
  return _pixelSort(tensor, shape, angle, darkest)
}
register("pixel_sort", pixelSort, { angled: false, darkest: false })
register("pixel_sort", pixelSort, { angled: false, darkest: false })

export async function glyphMap(
  tensor,
  shape,
  time,
  speed,
  mask = ValueMask.truetype,
  colorize = true,
  zoom = 1,
  alpha = 1,
  splineOrder = InterpolationType.constant,
) {
  if (mask === null || mask === undefined) mask = ValueMask.truetype
  const ctx = tensor.ctx
  let glyphShape
  const glyphEntries = []
  if (mask === ValueMask.truetype) {
    glyphShape = [15, 15, 1]
    const loaded = loadGlyphs(glyphShape) || []
    for (const glyph of loaded) {
      const gh = glyphShape[0]
      const gw = glyphShape[1]
      const flat = new Float32Array(gh * gw)
      let sum = 0
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const v = glyph[y][x][0]
          flat[y * gw + x] = v
          sum += v
        }
      }
      glyphEntries.push({ data: flat, sum })
    }
  } else {
    glyphShape = maskShape(mask)
    if (!glyphShape) return tensor
    const atlas = getAtlas(mask)
    const baseShape = maskShape(mask)
    const levels = 100
    const uvShapeY = Math.max(1, Math.floor(glyphShape[0] / baseShape[0]))
    const uvShapeX = Math.max(1, Math.floor(glyphShape[1] / baseShape[1]))
    for (let i = 0; i < levels; i++) {
      const uvVal = i / levels
      const uvNoise = []
      for (let uy = 0; uy < uvShapeY; uy++) {
        const row = new Array(uvShapeX).fill(uvVal)
        uvNoise.push(row)
      }
      const [glyphTensor] = maskValues(mask, [...glyphShape], {
        atlas,
        time,
        speed,
        uvNoise,
      })
      const dataMaybe = glyphTensor.read()
      const glyphData =
        dataMaybe && typeof dataMaybe.then === "function"
          ? await dataMaybe
          : dataMaybe
      const flat = glyphData instanceof Float32Array
        ? glyphData.slice()
        : new Float32Array(glyphData)
      let sum = 0
      for (let j = 0; j < flat.length; j++) sum += flat[j]
      glyphEntries.push({ data: flat, sum })
    }
  }
  if (!glyphEntries.length) return tensor
  glyphEntries.sort((a, b) => a.sum - b.sum)
  const glyphDataList = glyphEntries.map((entry) => entry.data)
  const [h, w, c] = shape
  const gh = glyphShape[0]
  const gw = glyphShape[1]
  const glyphChannels = glyphShape[2] ?? 1
  const glyphCount = glyphDataList.length

  const inH = Math.max(1, Math.floor(h / zoom))
  const inW = Math.max(1, Math.floor(w / zoom))
  const uvH = Math.max(1, Math.floor(inH / gh))
  const uvW = Math.max(1, Math.floor(inW / gw))
  const approxH = gh * uvH
  const approxW = gw * uvW

  let valueTensor = await toValueMap(tensor)
  if (valueTensor.shape[0] !== inH || valueTensor.shape[1] !== inW) {
    valueTensor = await resample(valueTensor, [inH, inW, 1])
  }
  valueTensor = await normalize(valueTensor)
  let uvNoise = await proportionalDownsample(
    valueTensor,
    [inH, inW, 1],
    [uvH, uvW],
  )
  uvNoise = await resample(uvNoise, [approxH, approxW, 1], splineOrder)
  const uvDataMaybe = uvNoise.read()
  const uvData =
    uvDataMaybe && typeof uvDataMaybe.then === "function"
      ? await uvDataMaybe
      : uvDataMaybe

  const approxData = new Float32Array(approxH * approxW)
  for (let y = 0; y < approxH; y++) {
    for (let x = 0; x < approxW; x++) {
      const idx = y * approxW + x
      let gIdx = Math.floor(uvData[idx] * glyphCount)
      if (glyphCount > 0) {
        gIdx = ((gIdx % glyphCount) + glyphCount) % glyphCount
      }
      const glyph = glyphDataList[gIdx]
      if (!glyph) continue
      const gy = y % gh
      const gx = x % gw
      approxData[idx] = glyph[(gy * gw + gx) * glyphChannels]
    }
  }

  const finalSplineOrder =
    mask === ValueMask.truetype ? InterpolationType.cosine : splineOrder
  let maskTensor = Tensor.fromArray(ctx, approxData, [approxH, approxW, 1])
  maskTensor = await resample(maskTensor, [h, w, 1], finalSplineOrder)

  if (!colorize) {
    if (c === 1) {
      if (alpha !== 1) {
        return await blend(tensor, maskTensor, alpha)
      }
      return maskTensor
    }
    const maskDataMaybe = maskTensor.read()
    const maskData =
      maskDataMaybe && typeof maskDataMaybe.then === "function"
        ? await maskDataMaybe
        : maskDataMaybe
    const expanded = new Float32Array(h * w * c)
    for (let i = 0; i < h * w; i++) {
      const base = i * c
      const v = maskData[i]
      for (let k = 0; k < c; k++) {
        expanded[base + k] = v
      }
    }
    let outTensor = Tensor.fromArray(ctx, expanded, shape)
    if (alpha !== 1) {
      outTensor = await blend(tensor, outTensor, alpha)
    }
    return outTensor
  }

  let colorTensor = await proportionalDownsample(tensor, shape, [uvH, uvW])
  colorTensor = await resample(colorTensor, shape, finalSplineOrder)
  const maskDataMaybe = maskTensor.read()
  const maskData =
    maskDataMaybe && typeof maskDataMaybe.then === "function"
      ? await maskDataMaybe
      : maskDataMaybe
  const colorDataMaybe = colorTensor.read()
  const colorData =
    colorDataMaybe && typeof colorDataMaybe.then === "function"
      ? await colorDataMaybe
      : colorDataMaybe
  const out = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const base = i * c
    const v = maskData[i]
    for (let k = 0; k < c; k++) {
      out[base + k] = v * colorData[base + k]
    }
  }
  let outTensor = Tensor.fromArray(ctx, out, shape)
  if (alpha !== 1) {
    outTensor = await blend(tensor, outTensor, alpha)
  }
  return outTensor
}
register("glyph_map", glyphMap, {
  mask: ValueMask.truetype,
  colorize: true,
  zoom: 1,
  alpha: 1,
  splineOrder: InterpolationType.constant,
})

export async function dla(
  tensor,
  shape,
  time,
  speed,
  padding = 2,
  seedDensity = 0.01,
  density = 0.125,
  xy = null,
  alpha = 1,
) {
  const [height, width, channels] = shape
  const neighborhoods = new Set()
  const expandedNeighborhoods = new Set()
  const clustered = []
  const walkers = []
  const scale = 1 / padding
  const halfWidth = Math.floor(width * scale)
  const halfHeight = Math.floor(height * scale)
  let x, y, seedCount
  if (xy === null) {
    seedCount = Math.floor(
      Math.sqrt(Math.floor(halfHeight * seedDensity) || 1),
    );
    [x, y] = pointCloud(seedCount, {
      distrib: PointDistribution.random,
      shape,
      time,
      speed,
    })
  } else {
    [x, y, seedCount] = xy
  }
  const walkersCount = halfHeight * halfWidth * density
  const walkersPerSeed = Math.floor(walkersCount / seedCount)
  const offsets = [-1, 0, 1]
  const expandedRange = 8
  const expandedOffsets = []
  for (let i = -expandedRange; i <= expandedRange; i++) expandedOffsets.push(i)
  for (let i = 0; i < seedCount; i++) {
    const node = [Math.floor(y[i] * scale), Math.floor(x[i] * scale)]
    clustered.push(node)
    for (const xo of offsets) {
      for (const yo of offsets) {
        neighborhoods.add(`${node[0] + yo},${node[1] + xo}`)
      }
    }
    for (const xo of expandedOffsets) {
      for (const yo of expandedOffsets) {
        expandedNeighborhoods.add(`${node[0] + yo},${node[1] + xo}`)
      }
    }
    for (let w = 0; w < walkersPerSeed; w++) {
      walkers.push([
        Math.floor(random() * halfHeight),
        Math.floor(random() * halfWidth),
      ])
    }
  }
  const iterations = Math.floor(Math.sqrt(walkersCount) * time * time)
  for (let i = 0; i < iterations; i++) {
    const remove = []
    for (const walker of walkers) {
      const key = `${walker[0]},${walker[1]}`
      if (neighborhoods.has(key)) remove.push(walker)
    }
    for (const walker of remove) {
      const idx = walkers.indexOf(walker)
      if (idx !== -1) walkers.splice(idx, 1)
      for (const xo of offsets) {
        for (const yo of offsets) {
          neighborhoods.add(
            `${(walker[0] + yo + halfHeight) % halfHeight},${
              (walker[1] + xo + halfWidth) % halfWidth
            }`,
          )
        }
      }
      for (const xo of expandedOffsets) {
        for (const yo of expandedOffsets) {
          expandedNeighborhoods.add(
            `${(walker[0] + yo + halfHeight) % halfHeight},${
              (walker[1] + xo + halfWidth) % halfWidth
            }`,
          )
        }
      }
      clustered.push(walker)
    }
    if (!walkers.length) break
    for (let w = 0; w < walkers.length; w++) {
      const walker = walkers[w]
      const key = `${walker[0]},${walker[1]}`
      let yo, xo
      if (expandedNeighborhoods.has(key)) {
        yo = offsets[randomInt(0, offsets.length - 1)]
        xo = offsets[randomInt(0, offsets.length - 1)]
      } else {
        yo = expandedOffsets[randomInt(0, expandedOffsets.length - 1)]
        xo = expandedOffsets[randomInt(0, expandedOffsets.length - 1)]
      }
      walker[0] = (walker[0] + yo + halfHeight) % halfHeight
      walker[1] = (walker[1] + xo + halfWidth) % halfWidth
    }
  }
  const uniqueMap = new Map()
  for (const c of clustered) {
    const key = `${c[0]},${c[1]}`
    if (!uniqueMap.has(key)) uniqueMap.set(key, c)
  }
  const unique = Array.from(uniqueMap.values())
  const count = unique.length
  const hot = new Float32Array(count * channels)
  for (let i = 0; i < count; i++) {
    const val = count - 1 - i
    for (let k = 0; k < channels; k++) hot[i * channels + k] = val
  }
  const grid = new Float32Array(height * width * channels)
  for (let i = 0; i < count; i++) {
    const [yy, xx] = unique[i]
    const sy = yy * padding
    const sx = xx * padding
    const base = (sy * width + sx) * channels
    for (let k = 0; k < channels; k++) {
      grid[base + k] = hot[i * channels + k]
    }
  }
  const scattered = Tensor.fromArray(tensor.ctx, grid, shape)
  const kernelTensor = maskValues(ValueMask.conv2d_blur)[0]
  const kData = await kernelTensor.read()
  const kernel = []
  for (let i = 0; i < 5; i++) {
    kernel.push(Array.from(kData.slice(i * 5, i * 5 + 5)))
  }
  const convolved = await convolution(scattered, kernel)
  const convData = await convolved.read()
  const tensorData = await tensor.read()
  const mult = new Float32Array(convData.length)
  for (let i = 0; i < convData.length; i++) {
    mult[i] = convData[i] * tensorData[i]
  }
  const out = Tensor.fromArray(tensor.ctx, mult, shape)
  return blend(tensor, out, alpha)
}


register("dla", dla, {
  padding: 2,
  seedDensity: 0.01,
  density: 0.125,
  xy: null,
  alpha: 1,
})

export async function simpleFrame(tensor, shape, time, speed, brightness = 0) {
  const rawH = shape?.[0]
  const rawW = shape?.[1]
  const rawC = shape?.[2]
  const h = Number.isFinite(rawH) ? rawH : tensor?.shape?.[0] ?? 0
  const w = Number.isFinite(rawW) ? rawW : tensor?.shape?.[1] ?? 0
  const cGuess = Number.isFinite(rawC) ? rawC : tensor?.shape?.[2] ?? 1
  const c = Math.max(1, cGuess || 0)
  if (h <= 0 || w <= 0 || c <= 0) {
    return tensor
  }
  const effectiveShape = [h, w, c]
  const ctx = tensor?.ctx ?? null
  let border = await singularity(
    tensor,
    effectiveShape,
    time,
    speed,
    VoronoiDiagramType.range,
    DistanceMetric.chebyshev,
  )
  const zeroData = new Float32Array(h * w * c)
  const zeroTensor = Tensor.fromArray(ctx, zeroData, effectiveShape)
  border = await blend(zeroTensor, border, 0.55)
  border = await posterize(border, effectiveShape, time, speed, 1)
  const bright = new Float32Array(h * w * c)
  bright.fill(brightness)
  const brightTensor = Tensor.fromArray(ctx, bright, effectiveShape)
  return await blend(tensor, brightTensor, border)
}
register("simple_frame", simpleFrame, { brightness: 0 })

async function simpleMultiresTensor(
  freq,
  shape,
  time,
  speed,
  octaves,
  ctx,
  ridges = false,
  opts = {},
) {
  const [h, w, c] = shape
  const freqArr = Array.isArray(freq)
    ? freq
    : freqForShape(freq, [h, w])
  const data = new Float32Array(h * w * c)
  for (let octave = 1; octave <= octaves; octave++) {
    const multiplier = 2 ** octave
    const baseFreq = freqArr.map((f) =>
      Math.floor(f * 0.5 * multiplier),
    )
    if (baseFreq[0] > h && baseFreq[1] > w) {
      break
    }
    let layerTensor = await values(baseFreq, shape, {
      ctx,
      time,
      speed,
      ...opts,
    })
    if (layerTensor && typeof layerTensor.then === "function") {
      layerTensor = await layerTensor
    }
    if (ridges) {
      layerTensor = await ridge(layerTensor)
    }
    const layerDataMaybe = layerTensor.read()
    const layerData =
      layerDataMaybe && typeof layerDataMaybe.then === "function"
        ? await layerDataMaybe
        : layerDataMaybe
    const layerArray =
      layerData instanceof Float32Array
        ? layerData
        : new Float32Array(layerData ?? [])
    for (let i = 0; i < data.length; i++) {
      data[i] += layerArray[i] / multiplier
    }
  }
  const tensor = Tensor.fromArray(ctx, data, shape)
  return normalize(tensor)
}

export async function frame(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const halfH = Math.max(1, Math.floor(h * 0.5))
  const halfW = Math.max(1, Math.floor(w * 0.5))
  const halfShape = [halfH, halfW, c]
  const halfValueShape = [halfH, halfW, 1]

  const noiseMaybe = await simpleMultiresTensor(
    64,
    halfValueShape,
    time,
    speed,
    8,
    ctx,
  )
  const noise =
    noiseMaybe && typeof noiseMaybe.then === "function"
      ? await noiseMaybe
      : noiseMaybe
  const noiseDataMaybe = noise.read()
  const noiseData =
    noiseDataMaybe && typeof noiseDataMaybe.then === "function"
      ? await noiseDataMaybe
      : noiseDataMaybe

  let maskBase = await singularity(
    null,
    halfValueShape,
    time,
    speed,
    VoronoiDiagramType.range,
    DistanceMetric.chebyshev,
  )
  let maskDataMaybe = maskBase.read()
  let maskData =
    maskDataMaybe && typeof maskDataMaybe.then === "function"
      ? await maskDataMaybe
      : maskDataMaybe
  for (let i = 0; i < maskData.length; i++) {
    maskData[i] = 1 - maskData[i]
  }
  const combined = new Float32Array(maskData.length)
  for (let i = 0; i < maskData.length; i++) {
    combined[i] = maskData[i] + noiseData[i] * 0.005
  }
  let mask = await normalize(Tensor.fromArray(ctx, combined, halfValueShape))
  const normDataMaybe = mask.read()
  const normData =
    normDataMaybe && typeof normDataMaybe.then === "function"
      ? await normDataMaybe
      : normDataMaybe
  for (let i = 0; i < normData.length; i++) {
    normData[i] = Math.sqrt(Math.max(normData[i], 0))
  }
  const sqrtMask = Tensor.fromArray(ctx, normData, halfValueShape)
  const white = Tensor.fromArray(
    ctx,
    new Float32Array(halfH * halfW).fill(1),
    halfValueShape,
  )
  const black = Tensor.fromArray(
    ctx,
    new Float32Array(halfH * halfW),
    halfValueShape,
  )
  mask = blendLayers(sqrtMask, halfValueShape, 0.0125, white, black, black, black)
  if (mask && typeof mask.then === "function") {
    mask = await mask
  }

  let faded = await proportionalDownsample(tensor, shape, [halfH, halfW])
  faded = faded && typeof faded.then === "function" ? await faded : faded
  // tf.image.adjust_brightness and tf.image.adjust_contrast, which do not
  // clamp.
  const fadedData = await faded.read()
  const brightness = Math.fround(0.1)
  const brightened = new Float32Array(fadedData.length)
  for (let i = 0; i < fadedData.length; i++) {
    brightened[i] = Math.fround(fadedData[i] + brightness)
  }
  faded = Tensor.fromArray(
    ctx,
    imageAdjustContrast(brightened, halfH * halfW, c, 0.75),
    halfShape,
  )
  if (halfH > 1 && halfW > 1) {
    faded = await lightLeak(faded, halfShape, time, speed, 0.125)
    faded = await vignette(faded, halfShape, time, speed, 0.05, 0.75)
  }

  const shadeTensor = await shadow(noise, halfValueShape, time, speed, 1.0)
  const shadeDataMaybe = shadeTensor.read()
  const shadeData =
    shadeDataMaybe && typeof shadeDataMaybe.then === "function"
      ? await shadeDataMaybe
      : shadeDataMaybe
  const edgeData = new Float32Array(halfH * halfW * c)
  const edgeBase = Math.fround(0.9)
  const edgeScale = Math.fround(0.1)
  for (let i = 0; i < halfH * halfW; i++) {
    const shade = Math.fround(
      edgeBase + Math.fround(shadeData[i] * edgeScale),
    )
    const base = i * c
    for (let k = 0; k < c; k++) {
      edgeData[base + k] = shade
    }
  }
  const edgeTex = Tensor.fromArray(ctx, edgeData, halfShape)

  let out = await blend(faded, edgeTex, mask)
  out = await aberration(out, halfShape, time, speed, 0.00666)
  out = await grime(out, halfShape, time, speed)
  if (c >= 3) {
    out = await saturation(out, halfShape, time, speed, 0.5)
    // tf.image.random_hue with a seed from the noisemaker RNG.
    const seed = randomInt(0, 0xffffffff)
    out = await adjustHue(out, seededHueDelta(seed, 0.05))
  }

  out = await resample(out, shape)
  out = await scratches(out, shape, time, speed)
  out = await strayHair(out, shape, time, speed)
  return out
}
register("frame", frame, {})

export async function sketch(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const valueShape = [h, w, 1]
  let valuesTensor = await toValueMap(tensor)
  valuesTensor = await normalize(valuesTensor)
  valuesTensor = await adjustContrast(valuesTensor, valueShape, time, speed, 2.0)
  valuesTensor = await clamp01(valuesTensor)
  const outlineTensorTmp = await derivative(
    valuesTensor,
    valueShape,
    time,
    speed
  )
  let outline = await outlineTensorTmp.read()
  const invValues = await valuesTensor.read()
  const invData = new Float32Array(invValues.length)
  for (let i = 0; i < invValues.length; i++) invData[i] = 1 - invValues[i]
  const d2Tensor = await derivative(
    Tensor.fromArray(tensor.ctx, invData, valueShape),
    valueShape,
    time,
    speed
  )
  const d2 = await d2Tensor.read()
  for (let i = 0; i < outline.length; i++) {
    outline[i] = Math.min(1 - outline[i], 1 - d2[i])
  }
  let outlineTensor = Tensor.fromArray(tensor.ctx, outline, valueShape)
  outlineTensor = await adjustContrast(
    outlineTensor,
    valueShape,
    time,
    speed,
    0.25
  )
  outlineTensor = await normalize(outlineTensor)
  valuesTensor = await vignette(
    valuesTensor,
    valueShape,
    time,
    speed,
    1.0,
    0.875
  )
  const vignetteValues = await valuesTensor.read()
  const inverseVignetteData = new Float32Array(vignetteValues.length)
  for (let i = 0; i < vignetteValues.length; i++) {
    inverseVignetteData[i] = 1 - vignetteValues[i]
  }
  const invValTensor = Tensor.fromArray(
    tensor.ctx,
    inverseVignetteData,
    valueShape
  )
  let wormsTensor = await worms(
    invValTensor,
    valueShape,
    time,
    speed,
    2,
    125,
    0.5,
    1,
    0.25,
    1.0
  )
  let wormsOut = await wormsTensor.read()
  for (let i = 0; i < wormsOut.length; i++) wormsOut[i] = 1 - wormsOut[i]
  let cross = Tensor.fromArray(tensor.ctx, wormsOut, [h, w, 1])
  cross = await normalize(cross)
  let combined = await blend(cross, outlineTensor, 0.75)
  combined = await warp(
    combined,
    valueShape,
    time,
    speed,
    [
      Math.max(1, Math.floor(h * 0.125)),
      Math.max(1, Math.floor(w * 0.125)),
    ],
    1,
    0.0025
  )
  const combData = await combined.read()
  for (let i = 0; i < combData.length; i++) combData[i] *= combData[i]
  combined = Tensor.fromArray(tensor.ctx, combData, valueShape)
  if (c === 1) return combined
  const out = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const v = combData[i]
    for (let k = 0; k < c; k++) out[i * c + k] = v
  }
  return Tensor.fromArray(tensor.ctx, out, shape)
}

register("sketch", sketch, {})

async function nebulaSimpleMultires(
  ctx,
  valueShape,
  freq,
  octaves,
  time,
  speed,
  distrib = ValueDistribution.simplex,
) {
  const [h, w] = valueShape
  const freqArr = Array.isArray(freq) ? freq : freqForShape(freq, [h, w])
  const accum = new Float32Array(h * w)
  for (let octave = 1; octave <= octaves; octave++) {
    const multiplier = 2 ** octave
    const baseFreq = freqArr.map((f) => Math.floor(f * 0.5 * multiplier))
    if (baseFreq[0] > h && baseFreq[1] > w) {
      break
    }
    let layer = await values(baseFreq, valueShape, {
      ctx,
      time,
      speed,
      distrib,
    })
    layer = await ridge(layer)
    const layerData = await layer.read()
    const layerArr =
      layerData instanceof Float32Array
        ? layerData
        : Float32Array.from(layerData ?? [])
    for (let i = 0; i < accum.length; i++) {
      accum[i] = Math.fround(accum[i] + layerArr[i] / multiplier)
    }
  }
  const tensorOut = Tensor.fromArray(ctx, accum, valueShape)
  return await normalize(tensorOut)
}

async function computeNebulaMask(ctx, shape, time, speed) {
  const [h, w] = shape
  const valueShape = [h, w, 1]
  const overlayFreq = [randomInt(3, 4), 1]
  const subtractFreq = [randomInt(2, 4), 1]

  let overlay = await nebulaSimpleMultires(
    ctx,
    valueShape,
    overlayFreq,
    6,
    time,
    speed,
    ValueDistribution.exp,
  )
  const subtractor = await nebulaSimpleMultires(
    ctx,
    valueShape,
    subtractFreq,
    4,
    time,
    speed,
  )

  const overlayData = await overlay.read()
  const subtractData = await subtractor.read()
  const overlayArr =
    overlayData instanceof Float32Array
      ? overlayData
      : Float32Array.from(overlayData ?? [])
  const subtractArr =
    subtractData instanceof Float32Array
      ? subtractData
      : Float32Array.from(subtractData ?? [])

  const diff = new Float32Array(h * w)
  for (let i = 0; i < diff.length; i++) {
    const ov = Math.fround(overlayArr[i] ?? 0)
    const sub = Math.fround(subtractArr[i] ?? 0)
    diff[i] = Math.fround((ov - sub) * 0.125)
  }

  let diffTensor = Tensor.fromArray(ctx, diff, valueShape)
  diffTensor = await rotate(
    diffTensor,
    valueShape,
    time,
    speed,
    randomInt(-15, 15),
  )
  const rotatedDataMaybe = diffTensor.read()
  const rotatedData =
    rotatedDataMaybe && typeof rotatedDataMaybe.then === "function"
      ? await rotatedDataMaybe
      : rotatedDataMaybe
  return rotatedData instanceof Float32Array
    ? rotatedData
    : Float32Array.from(rotatedData ?? [])
}

export async function nebula(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const rotatedArr = await computeNebulaMask(ctx, [h, w], time, speed)
  const baseDataMaybe = tensor.read()
  const baseData =
    baseDataMaybe && typeof baseDataMaybe.then === "function"
      ? await baseDataMaybe
      : baseDataMaybe
  const baseArr =
    baseData instanceof Float32Array
      ? baseData
      : Float32Array.from(baseData ?? [])

  for (let i = 0; i < h * w; i++) {
    const mult = Math.fround(1 - (rotatedArr[i] ?? 0))
    for (let k = 0; k < c; k++) {
      const idx = i * c + k
      baseArr[idx] = Math.fround((baseArr[idx] ?? 0) * mult)
    }
  }

  const expanded = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const v = Math.fround(Math.max(rotatedArr[i] ?? 0, 0))
    for (let k = 0; k < c; k++) {
      expanded[i * c + k] = v
    }
  }

  const overlayTensor = Tensor.fromArray(ctx, expanded, shape)
  const tinted = await tint(overlayTensor, shape, time, 1.0, 1.0)
  const tintedDataMaybe = tinted.read()
  const tintedData =
    tintedDataMaybe && typeof tintedDataMaybe.then === "function"
      ? await tintedDataMaybe
      : tintedDataMaybe
  const tintedArr =
    tintedData instanceof Float32Array
      ? tintedData
      : Float32Array.from(tintedData ?? [])

  for (let i = 0; i < baseArr.length; i++) {
    const tVal = Math.fround(tintedArr[i] ?? 0)
    baseArr[i] = Math.fround((baseArr[i] ?? 0) + tVal)
  }

  return Tensor.fromArray(ctx, baseArr, shape)
}
register("nebula", nebula, {})

export async function spatter(tensor, shape, time, speed, color = true) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]

  let smear = await simpleMultiresTensor(randomInt(3, 6), valueShape, time, speed, 6, ctx, false, {
    distrib: ValueDistribution.exp,
    splineOrder: InterpolationType.bicubic,
  })
  smear = await warp(
    smear,
    valueShape,
    time,
    speed,
    [randomInt(2, 3), randomInt(1, 3)],
    randomInt(1, 2),
    1 + random(),
    InterpolationType.bicubic,
  )

  let sp1 = await simpleMultiresTensor(
    randomInt(32, 64),
    valueShape,
    time,
    speed,
    4,
    ctx,
    false,
    {
      distrib: ValueDistribution.exp,
      splineOrder: InterpolationType.linear,
    },
  )
  sp1 = await adjustBrightness(sp1, valueShape, time, speed, -1.0)
  sp1 = await adjustContrast(sp1, valueShape, time, speed, 4.0)
  smear = await withTensorDatas([smear, sp1], (smData, spData) => {
    const out = new Float32Array(smData.length)
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(smData[i], spData[i])
    }
    return Tensor.fromArray(ctx, out, valueShape)
  })

  let sp2 = await simpleMultiresTensor(
    randomInt(150, 200),
    valueShape,
    time,
    speed,
    4,
    ctx,
    false,
    {
      distrib: ValueDistribution.exp,
      splineOrder: InterpolationType.linear,
    },
  )
  sp2 = await adjustBrightness(sp2, valueShape, time, speed, -1.25)
  sp2 = await adjustContrast(sp2, valueShape, time, speed, 4.0)
  smear = await withTensorDatas([smear, sp2], (smData, spData) => {
    const out = new Float32Array(smData.length)
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(smData[i], spData[i])
    }
    return Tensor.fromArray(ctx, out, valueShape)
  })

  const remover = await simpleMultiresTensor(
    randomInt(2, 3),
    valueShape,
    time,
    speed,
    3,
    ctx,
    true,
    {
      distrib: ValueDistribution.exp,
      splineOrder: InterpolationType.cosine,
    },
  )
  smear = await withTensorDatas([smear, remover], (smData, remData) => {
    const out = new Float32Array(smData.length)
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(smData[i] - remData[i], 0)
    }
    return Tensor.fromArray(ctx, out, valueShape)
  })

  let control = await normalize(smear)

  let splash
  if (color && c === 3) {
    if (Array.isArray(color)) {
      const colData = new Float32Array(h * w * 3)
      for (let i = 0; i < h * w; i++) {
        colData[i * 3] = color[0]
        colData[i * 3 + 1] = color[1]
        colData[i * 3 + 2] = color[2]
      }
      splash = Tensor.fromArray(ctx, colData, shape)
    } else {
      const baseData = new Float32Array(h * w * 3)
      for (let i = 0; i < h * w; i++) {
        baseData[i * 3] = 0.875
        baseData[i * 3 + 1] = 0.125
        baseData[i * 3 + 2] = 0.125
      }
      const base = Tensor.fromArray(ctx, baseData, shape)
      const delta = seededHueDelta(randomInt(0, 0xffffffff), 0.5)
      splash = await adjustHue(base, delta)
    }
  } else {
    const zero = new Float32Array(h * w * c)
    splash = Tensor.fromArray(ctx, zero, shape)
  }

  const tintedMaybe = await withTensorDatas([splash, tensor], (sData, tData) => {
    const out = new Float32Array(tData.length)
    for (let i = 0; i < out.length; i++) {
      out[i] = sData[i] * tData[i]
    }
    return Tensor.fromArray(ctx, out, shape)
  })
  const tinted =
    tintedMaybe && typeof tintedMaybe.then === "function"
      ? await tintedMaybe
      : tintedMaybe

  return await blendLayers(control, shape, 0.005, tensor, tinted)
}

register("spatter", spatter, { color: true })

export async function clouds(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const preH = Math.max(1, Math.floor(h * 0.25))
  const preW = Math.max(1, Math.floor(w * 0.25))
  const preShape = [preH, preW, 1]

  const baseFreq = freqForShape(randomInt(2, 4), [preH, preW])
  const accum = new Float32Array(preH * preW)
  for (let octave = 1; octave <= 8; octave++) {
    const mult = 2 ** octave
    const octaveFreq = baseFreq.map((f) => Math.floor(f * 0.5 * mult))
    if (octaveFreq[0] > preH && octaveFreq[1] > preW) break
    let layer = await values(octaveFreq, preShape, { ctx, time, speed })
    layer = await ridge(layer)
    const data = await layer.read()
    const inv = 1 / mult
    for (let i = 0; i < accum.length; i++) accum[i] += data[i] * inv
  }
  let control = Tensor.fromArray(ctx, accum, preShape)
  control = await normalize(control)
  control = await warp(control, preShape, time, speed, 3, 2, 0.125)

  const ones = new Float32Array(preH * preW)
  ones.fill(1)
  const zeros = new Float32Array(preH * preW)
  const layer0 = Tensor.fromArray(ctx, ones, preShape)
  const layer1 = Tensor.fromArray(ctx, zeros, preShape)
  let combined = blendLayers(control, preShape, 1.0, layer0, layer1)

  let shaded = await offsetTensor(
    combined,
    randomInt(-15, 15),
    randomInt(-15, 15),
  )
  let shadeData = await shaded.read()
  for (let i = 0; i < shadeData.length; i++) {
    shadeData[i] = Math.min(shadeData[i] * 2.5, 1)
  }
  shaded = Tensor.fromArray(ctx, shadeData, preShape)

  const blurTensor = maskValues(ValueMask.conv2d_blur)[0]
  const blurData = await blurTensor.read()
  const blurSize = blurTensor.shape[0]
  const blurKernel = []
  for (let y = 0; y < blurSize; y++) {
    blurKernel.push(
      Array.from(blurData.slice(y * blurSize, y * blurSize + blurSize)),
    )
  }
  for (let i = 0; i < 3; i++) {
    shaded = await convolution(shaded, blurKernel)
  }

  const postShape = [h, w, 1]
  shaded = await resample(shaded, postShape)
  combined = await resample(combined, postShape)

  const shadedArr = await shaded.read()
  for (let i = 0; i < shadedArr.length; i++) shadedArr[i] *= 0.75
  shaded = Tensor.fromArray(ctx, shadedArr, postShape)

  const zerosTensor = await values(1, shape, {
    ctx,
    distrib: ValueDistribution.zeros,
  })
  const onesTensor = await values(1, shape, {
    ctx,
    distrib: ValueDistribution.ones,
  })

  let out = await blend(tensor, zerosTensor, shaded)
  out = await blend(out, onesTensor, combined)
  return await shadow(out, shape, time, speed, 0.5)
}

register("clouds", clouds, {})

export async function fibers(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]
  const maskScale = 0.5
  let out = tensor
  for (let i = 0; i < 4; i++) {
    let mask = await values(4, valueShape, { ctx, time, speed })
    const density = 0.05 + random() * 0.00125
    const kink = randomInt(5, 10)
    mask = await worms(
      mask,
      valueShape,
      time,
      speed,
      WormBehavior.chaotic,
      density,
      1,
      0.75,
      0.125,
      1,
      kink,
    )
    let brightness = await values(128, shape, { ctx, time, speed })

    const maskData = await mask.read()
    const scaledMask = new Float32Array(maskData.length)
    for (let j = 0; j < maskData.length; j++) {
      scaledMask[j] = maskData[j] * maskScale
    }
    const scaledMaskTensor = Tensor.fromArray(ctx, scaledMask, valueShape)
    out = await blend(out, brightness, scaledMaskTensor)
  }
  return out
}
register("fibers", fibers, {})

async function buildScratches(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]
  let out = tensor
  for (let i = 0; i < 4; i++) {
    let mask = await values(randomInt(2, 4), valueShape, { ctx, time, speed })
    const behavior = [WormBehavior.obedient, WormBehavior.unruly][
      randomInt(0, 1)
    ]
    const density = 0.25 + random() * 0.25
    const duration = 2 + random() * 2
    const kink = 0.125 + random() * 0.125
    mask = await worms(
      mask,
      valueShape,
      time,
      speed,
      behavior,
      density,
      duration,
      0.75,
      0.5,
      1,
      kink,
    )
    const sub = await values(randomInt(2, 4), valueShape, { ctx, time, speed })
    // ``mask`` and ``sub`` may resolve to promises; ensure data is awaited
    let maskData = await mask.read()
    const subData = await sub.read()
    for (let j = 0; j < maskData.length; j++) {
      maskData[j] = Math.max(maskData[j] - subData[j] * 2.0, 0)
    }
    mask = Tensor.fromArray(ctx, maskData, valueShape)
    const outData = await out.read()
    maskData = await mask.read()
    // As in the Python reference, the result is capped at 1, including input
    // values above 1.
    for (let j = 0; j < h * w; j++) {
      const m = maskData[j] * 8.0
      for (let k = 0; k < c; k++) {
        const idx = j * c + k
        outData[idx] = Math.min(Math.max(outData[idx], m), 1.0)
      }
    }
    out = Tensor.fromArray(ctx, outData, shape)
  }
  return out
}

export async function scratches(tensor, shape, time, speed) {
  const base = await buildScratches(tensor, shape, time, speed)
  return strayHair(base, shape, time, speed)
}
register("scratches", scratches, {})

export async function strayHair(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]
  let mask = await values(4, valueShape, { ctx, time, speed })
  const density = 0.0025 + random() * 0.00125
  const duration = randomInt(8, 16)
  const kink = randomInt(5, 50)
  mask = await worms(
    mask,
    valueShape,
    time,
    speed,
    WormBehavior.unruly,
    density,
    duration,
    0.5,
    0.25,
    1,
    kink,
  )
  const brightnessScale = 0.333
  const maskScale = 0.666
  let brightness = await values(32, valueShape, { ctx, time, speed })
  const scaledBrightness = await scaleTensor(brightness, brightnessScale)
  const scaledMask = await scaleTensor(mask, maskScale)
  return await blend(tensor, scaledBrightness, scaledMask)
}
register("stray_hair", strayHair, {})
register("stray_hair", strayHair, {})

export async function grime(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  const valueShape = [h, w, 1]

  const baseMask = await fbm(null, valueShape, time, speed, 5, 8)
  const baseDataMaybe = baseMask.read()
  const baseDataRaw =
    baseDataMaybe && typeof baseDataMaybe.then === "function"
      ? await baseDataMaybe
      : baseDataMaybe
  const baseData =
    baseDataRaw instanceof Float32Array
      ? baseDataRaw
      : new Float32Array(baseDataRaw ?? [])
  const rxTensor = Tensor.fromArray(ctx, baseData.slice(), valueShape)
  const offsetData = new Float32Array(h * w)
  const xOffset = Math.floor(w * 0.5)
  const yOffset = Math.floor(h * 0.5)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const oy = (y + yOffset) % h
      const ox = (x + xOffset) % w
      offsetData[idx] = baseData[oy * w + ox]
    }
  }
  const ryTensor = Tensor.fromArray(ctx, offsetData, valueShape)
  const offsetMask = Tensor.fromArray(ctx, offsetData.slice(), valueShape)
  let mask = await refractOp(
    offsetMask,
    rxTensor,
    ryTensor,
    1.0,
    InterpolationType.bicubic,
    true,
  )
  mask = await derivative(
    mask,
    valueShape,
    time,
    speed,
    DistanceMetric.chebyshev,
    true,
    0.125,
  )
  let gateDataMaybe = mask.read()
  let gateData =
    gateDataMaybe && typeof gateDataMaybe.then === "function"
      ? await gateDataMaybe
      : gateDataMaybe
  gateData =
    gateData instanceof Float32Array
      ? gateData
      : new Float32Array(gateData ?? [])
  const gate = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const v = gateData[i] * gateData[i] * 0.075
    for (let k = 0; k < c; k++) gate[i * c + k] = v
  }
  const gateTensor = Tensor.fromArray(ctx, gate, shape)
  const baseValues = new Float32Array(h * w * c).fill(0.25)
  const baseTensor = Tensor.fromArray(ctx, baseValues, shape)
  let dusty = await blend(tensor, baseTensor, gateTensor)

  const speckFreq = [
    Math.max(1, Math.floor(h * 0.25)),
    Math.max(1, Math.floor(w * 0.25)),
  ]
  let specks = await values(speckFreq, valueShape, {
    ctx,
    time,
    speed,
    distrib: ValueDistribution.exp,
    mask: ValueMask.dropout,
  })
  const speckDataMaybe = specks.read()
  const speckDataRaw =
    speckDataMaybe && typeof speckDataMaybe.then === "function"
      ? await speckDataMaybe
      : speckDataMaybe
  const speckData =
    speckDataRaw instanceof Float32Array
      ? speckDataRaw
      : new Float32Array(speckDataRaw ?? [])
  const cosData = new Float32Array(h * w)
  const sinData = new Float32Array(h * w)
  for (let i = 0; i < h * w; i++) {
    const angle = speckData[i] * TAU
    const cosVal = Math.cos(angle) * 0.5 + 0.5
    const sinVal = Math.sin(angle) * 0.5 + 0.5
    cosData[i] = Math.fround(Math.min(Math.max(cosVal, 0), 1))
    sinData[i] = Math.fround(Math.min(Math.max(sinVal, 0), 1))
  }
  const cosTensor = Tensor.fromArray(ctx, cosData, valueShape)
  const sinTensor = Tensor.fromArray(ctx, sinData, valueShape)
  specks = await refractOp(
    specks,
    cosTensor,
    sinTensor,
    0.25,
    InterpolationType.bicubic,
    true,
  )

  let speckValuesMaybe = specks.read()
  let speckValues =
    speckValuesMaybe && typeof speckValuesMaybe.then === "function"
      ? await speckValuesMaybe
      : speckValuesMaybe
  speckValues =
    speckValues instanceof Float32Array
      ? speckValues
      : new Float32Array(speckValues ?? [])
  for (let i = 0; i < speckValues.length; i++) {
    speckValues[i] = Math.max(speckValues[i] - 0.625, 0)
  }
  specks = Tensor.fromArray(ctx, speckValues, valueShape)
  specks = await normalize(specks)
  speckValuesMaybe = specks.read()
  speckValues =
    speckValuesMaybe && typeof speckValuesMaybe.then === "function"
      ? await speckValuesMaybe
      : speckValuesMaybe
  speckValues =
    speckValues instanceof Float32Array
      ? speckValues
      : new Float32Array(speckValues ?? [])
  for (let i = 0; i < speckValues.length; i++) {
    speckValues[i] = 1 - Math.sqrt(speckValues[i])
  }
  specks = Tensor.fromArray(ctx, speckValues, valueShape)

  let noise = await values([h, w], valueShape, {
    ctx,
    time,
    speed,
    distrib: ValueDistribution.exp,
    mask: ValueMask.sparse,
  })
  dusty = await blend(dusty, noise, 0.075)
  let dustyDataMaybe = dusty.read()
  let dustyData =
    dustyDataMaybe && typeof dustyDataMaybe.then === "function"
      ? await dustyDataMaybe
      : dustyDataMaybe
  dustyData =
    dustyData instanceof Float32Array
      ? dustyData
      : new Float32Array(dustyData ?? [])
  const speckMaskMaybe = specks.read()
  let speckMask =
    speckMaskMaybe && typeof speckMaskMaybe.then === "function"
      ? await speckMaskMaybe
      : speckMaskMaybe
  speckMask =
    speckMask instanceof Float32Array
      ? speckMask
      : new Float32Array(speckMask ?? [])
  for (let i = 0; i < dustyData.length; i++) {
    dustyData[i] *= speckMask[Math.floor(i / c)]
  }
  dusty = Tensor.fromArray(ctx, dustyData, shape)

  gateDataMaybe = mask.read()
  gateData =
    gateDataMaybe && typeof gateDataMaybe.then === "function"
      ? await gateDataMaybe
      : gateDataMaybe
  gateData =
    gateData instanceof Float32Array
      ? gateData
      : new Float32Array(gateData ?? [])
  const maskScaled = new Float32Array(h * w * c)
  for (let i = 0; i < h * w; i++) {
    const v = gateData[i] * 0.75
    for (let k = 0; k < c; k++) maskScaled[i * c + k] = v
  }
  const maskTensor = Tensor.fromArray(ctx, maskScaled, shape)
  return await blend(tensor, dusty, maskTensor)
}

register("grime", grime, {})

export async function onScreenDisplay(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor?.ctx ?? null
  const glyphCount = randomInt(3, 6)
  const masks = [
    ValueMask.bank_ocr,
    ValueMask.alphanum_hex,
    ValueMask.alphanum_numeric,
  ]
  const mask = masks[randomInt(0, masks.length - 1)]
  const gShape = maskShape(mask)
  const glyphHeight = gShape?.[0] ?? 0
  const glyphWidth = gShape?.[1] ?? 0
  const channels = Math.max(1, c || 1)
  if (glyphHeight <= 0 || glyphWidth <= 0 || channels <= 0) {
    return tensor
  }

  // Below 144 pixels (168 for bank_ocr) the display is narrower than one
  // glyph, so the row is empty. The reference still draws the glyph noise
  // seed and alpha at every width, so this path draws them too and blends the
  // empty row.
  let baseWidth = Math.floor(w / 24)
  baseWidth = glyphWidth * Math.floor(baseWidth / glyphWidth)
  const tileCount = Math.floor(baseWidth / glyphWidth)
  const rowHeight = glyphHeight * tileCount
  const totalWidth = baseWidth * glyphCount

  const offsetY = 25
  const offsetX = w - totalWidth - 25
  const atlas = getAtlas(mask)
  const atlasGlyphCount = Array.isArray(atlas) ? atlas.length : 0
  if (!atlasGlyphCount) {
    return tensor
  }

  const effTime = Number.isFinite(time) ? time : 0
  const effSpeed = Number.isFinite(speed) ? speed : 1
  const uvShape = [1, glyphCount]
  // Same RNG order as the reference: the glyph noise seed (drawn in
  // mask_values), then alpha.
  const noiseSeed = randomInt(1, 65536)
  const alpha = Math.fround(0.5 + random() * 0.25)
  const uvTensor = simplex([...uvShape, 1], {
    time: effTime,
    seed: noiseSeed,
    speed: effSpeed,
  })
  const uvDataMaybe = uvTensor.read()
  const uvData =
    uvDataMaybe && typeof uvDataMaybe.then === "function"
      ? await uvDataMaybe
      : uvDataMaybe
  const uvArr =
    uvData instanceof Float32Array
      ? uvData
      : Float32Array.from(uvData ?? [])

  const glyphIndices = new Uint32Array(glyphCount)
  for (let i = 0; i < glyphCount; i++) {
    let noiseVal = uvArr[i] ?? 0
    if (!Number.isFinite(noiseVal)) {
      noiseVal = 0
    }
    let glyphIndex = Math.floor(noiseVal * atlasGlyphCount)
    if (glyphIndex < 0) glyphIndex = 0
    if (glyphIndex >= atlasGlyphCount) {
      glyphIndex = atlasGlyphCount - 1
    }
    glyphIndices[i] = glyphIndex >>> 0
  }

  const glyphAtlasData = new Float32Array(
    atlasGlyphCount * glyphHeight * glyphWidth,
  )
  for (let gi = 0; gi < atlasGlyphCount; gi++) {
    const glyph = atlas[gi] ?? []
    for (let gy = 0; gy < glyphHeight; gy++) {
      const row = glyph[gy] ?? []
      for (let gx = 0; gx < glyphWidth; gx++) {
        let val = row[gx]
        if (Array.isArray(val)) {
          val = val[0]
        }
        const idx = gi * glyphHeight * glyphWidth + gy * glyphWidth + gx
        glyphAtlasData[idx] = Math.fround(val ?? 0)
      }
    }
  }

  const pad = new Float32Array(h * w * channels)
  for (let y = 0; y < rowHeight; y++) {
    const destY = offsetY + y
    if (destY < 0 || destY >= h) continue
    const scaledY = Math.floor(y / tileCount)
    const glyphY = ((scaledY % glyphHeight) + glyphHeight) % glyphHeight
    for (let x = 0; x < totalWidth; x++) {
      const destX = offsetX + x
      if (destX < 0 || destX >= w) continue
      const scaledX = Math.floor(x / tileCount)
      const glyphColumn = Math.floor(scaledX / glyphWidth)
      if (glyphColumn < 0 || glyphColumn >= glyphCount) continue
      const glyphIndex = glyphIndices[glyphColumn]
      if (glyphIndex >= atlasGlyphCount) continue
      const glyph = atlas[glyphIndex] ?? []
      const glyphX = ((scaledX % glyphWidth) + glyphWidth) % glyphWidth
      let glyphVal = glyph[glyphY]?.[glyphX]
      if (Array.isArray(glyphVal)) {
        glyphVal = glyphVal[0]
      }
      const value = Math.fround(glyphVal ?? 0)
      if (value <= 0) continue
      const dstBase = (destY * w + destX) * channels
      for (let k = 0; k < channels; k++) {
        pad[dstBase + k] = value
      }
    }
  }

  const rendered = Tensor.fromArray(ctx, pad, shape)
  const [renderedDataMaybe, tensorDataMaybe] = await Promise.all([
    rendered.read(),
    tensor.read(),
  ])
  const renderedData =
    renderedDataMaybe && typeof renderedDataMaybe.then === "function"
      ? await renderedDataMaybe
      : renderedDataMaybe
  const tensorData =
    tensorDataMaybe && typeof tensorDataMaybe.then === "function"
      ? await tensorDataMaybe
      : tensorDataMaybe
  const rendArr =
    renderedData instanceof Float32Array
      ? renderedData
      : Float32Array.from(renderedData ?? [])
  const tensorArr =
    tensorData instanceof Float32Array
      ? tensorData
      : Float32Array.from(tensorData ?? [])
  for (let i = 0; i < rendArr.length; i++) {
    const maxVal = Math.max(rendArr[i] ?? 0, tensorArr[i] ?? 0)
    rendArr[i] = Math.fround(maxVal)
  }
  const maxTensor = Tensor.fromArray(ctx, rendArr, shape)
  return blend(tensor, maxTensor, alpha)
}
register("on_screen_display", onScreenDisplay, {})

export async function spookyTicker(tensor, shape, time, speed) {
  const [h, w, c] = shape
  const ctx = tensor.ctx
  if (random() > 0.75) {
    tensor = await onScreenDisplay(tensor, shape, time, speed)
  }
  const masks = [
    ValueMask.arecibo_nucleotide,
    ValueMask.arecibo_num,
    ValueMask.bank_ocr,
    ValueMask.bar_code,
    ValueMask.bar_code_short,
    ValueMask.emoji,
    ValueMask.fat_lcd_hex,
    ValueMask.alphanum_hex,
    ValueMask.iching,
    ValueMask.ideogram,
    ValueMask.invaders,
    ValueMask.lcd,
    ValueMask.letters,
    ValueMask.matrix,
    ValueMask.alphanum_numeric,
    ValueMask.script,
    ValueMask.white_bear,
  ]
  const renderedData = new Float32Array(h * w * c)
  let bottomPadding = 2
  const rowCount = randomInt(1, 3)
  for (let i = 0; i < rowCount; i++) {
    const mask = masks[randomInt(0, masks.length - 1)]
    const mShape = maskShape(mask)
    const mh = mShape[0]
    const mw = mShape[1]
    let multiplier = 2
    if (mask !== ValueMask.script && (mw === 1 || mw >= 10)) {
      multiplier = 1
    }
    let width = Math.floor(w / multiplier) || 1
    width = mw * Math.floor(width / mw)
    if (width <= 0) continue
    const freq = [mh, width]
    const rowShape = [mh, width, 1]
    let rowMask = await values(freq, rowShape, {
      ctx,
      time,
      speed,
      corners: true,
      splineOrder: InterpolationType.constant,
      distrib: ValueDistribution.ones,
      mask,
    })
    if (time !== 0) {
      const xShift = Math.floor(time * width)
      rowMask = await offsetTensor(rowMask, xShift, 0)
    }
    const targetHeight = mh * multiplier
    rowMask = await resample(
      rowMask,
      [targetHeight, w, 1],
      InterpolationType.linear,
    )
    const rowData = await rowMask.read()
    const startY = h - bottomPadding - targetHeight
    for (let y = 0; y < targetHeight; y++) {
      const yy = startY + y
      if (yy < 0 || yy >= h) continue
      for (let x = 0; x < w; x++) {
        const val = rowData[y * w + x]
        const base = (yy * w + x) * c
        for (let k = 0; k < c; k++) {
          renderedData[base + k] += val
        }
      }
    }
    bottomPadding += targetHeight + 2
  }
  const renderedMask = Tensor.fromArray(ctx, renderedData, shape)
  const alpha = 0.5 + random() * 0.25
  const offsetMask = await offsetTensor(renderedMask, -1, -1)
  const [tensorData, offsetData] = await Promise.all([
    tensor.read(),
    offsetMask.read(),
  ])
  const diff = new Float32Array(tensorData.length)
  for (let i = 0; i < diff.length; i++) {
    diff[i] = tensorData[i] - offsetData[i]
  }
  const diffTensor = Tensor.fromArray(ctx, diff, shape)
  let blended = await blend(tensor, diffTensor, alpha * 0.333)
  const [renderedVals, blendedVals] = await Promise.all([
    renderedMask.read(),
    blended.read(),
  ])
  const maxData = new Float32Array(blendedVals.length)
  for (let i = 0; i < maxData.length; i++) {
    maxData[i] = Math.max(renderedVals[i], blendedVals[i])
  }
  const maxTensor = Tensor.fromArray(ctx, maxData, shape)
  return await blend(blended, maxTensor, alpha)
}
register("spooky_ticker", spookyTicker, {})

export function skew(tensor, shape, time, speed) {
  // Placeholder implementation; performs no skewing.
  return tensor
}
register("skew", skew, {})
