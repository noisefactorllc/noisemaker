import constants from '../../share/constants.json' with { type: "json" }

export const DistanceMetric = Object.freeze(constants.DistanceMetric)
export const InterpolationType = Object.freeze(constants.InterpolationType)
export const PointDistribution = Object.freeze(constants.PointDistribution)
export const ValueDistribution = Object.freeze(constants.ValueDistribution)
export const ValueMask = Object.freeze(constants.ValueMask)
export const VoronoiDiagramType = Object.freeze(constants.VoronoiDiagramType)
export const WormBehavior = Object.freeze(constants.WormBehavior)
export const OctaveBlending = Object.freeze(constants.OctaveBlending)
export const ColorSpace = Object.freeze(constants.ColorSpace)

export function isAbsolute(metric) {
  return metric !== DistanceMetric.none && metric < DistanceMetric.triangular
}

export function isCenterDistribution(distrib) {
  return distrib && distrib >= ValueDistribution.center_circle && distrib < 40
}

export function isSigned(metric) {
  return metric !== DistanceMetric.none && !isAbsolute(metric)
}

function enumArray(name, values) {
  const arr = Array.from(values)
  Object.defineProperty(arr, '__enum', { value: name })
  return Object.freeze(arr)
}

export function distanceMetricAll() {
  return enumArray('DistanceMetric',
    Object.values(DistanceMetric).filter(
      (m) => m !== DistanceMetric.none
    )
  )
}

export function distanceMetricAbsoluteMembers() {
  return enumArray('DistanceMetric',
    distanceMetricAll().filter((m) => isAbsolute(m))
  )
}

export function distanceMetricSignedMembers() {
  return enumArray('DistanceMetric',
    distanceMetricAll().filter((m) => isSigned(m))
  )
}

export function isNativeSize(distrib) {
  return isCenterDistribution(distrib)
}

export function isGrid(distrib) {
  return (
    distrib >= PointDistribution.square &&
    distrib < PointDistribution.spiral
  )
}

export function isCircular(distrib) {
  return distrib >= PointDistribution.circular
}

export const gridMembers = enumArray('PointDistribution',
  Object.values(PointDistribution).filter((d) => isGrid(d))
)

export const circularMembers = enumArray('PointDistribution',
  Object.values(PointDistribution).filter((d) => isCircular(d))
)

export function isNoise(distrib) {
  return distrib && distrib < ValueDistribution.ones
}

export function isValueMaskProcedural(mask) {
  return mask >= ValueMask.sparse
}

export const valueMaskNonproceduralMembers = enumArray('ValueMask',
  Object.values(ValueMask).filter((m) => !isValueMaskProcedural(m))
)

export const valueMaskProceduralMembers = enumArray('ValueMask',
  Object.values(ValueMask).filter((m) => isValueMaskProcedural(m))
)

export const valueMaskConv2dMembers = enumArray('ValueMask',
  Object.entries(ValueMask)
    .filter(([k]) => k.startsWith("conv2d"))
    .map(([, v]) => v)
)

export function isValueMaskConv2d(mask) {
  return valueMaskConv2dMembers.includes(mask)
}

export const valueMaskGridMembers = enumArray('ValueMask',
  Object.values(ValueMask).filter((m) => m < ValueMask.alphanum_0)
)

export function isValueMaskGrid(mask) {
  return mask < ValueMask.alphanum_0
}

export const valueMaskRgbMembers = enumArray('ValueMask',
  Object.values(ValueMask).filter(
    (m) => m >= ValueMask.rgb && m < ValueMask.sparse
  )
)

export function isValueMaskRgb(mask) {
  return mask >= ValueMask.rgb && mask < ValueMask.sparse
}

export const valueMaskGlyphMembers = enumArray('ValueMask',
  Object.values(ValueMask).filter(
    (m) =>
      (m >= ValueMask.invaders && m <= ValueMask.tromino) ||
      (m >= ValueMask.lcd && m <= ValueMask.arecibo_dna) ||
      m === ValueMask.emoji ||
      m === ValueMask.bank_ocr
  )
)

export function isValueMaskGlyph(mask) {
  return valueMaskGlyphMembers.includes(mask)
}

export const flowMembers = enumArray('VoronoiDiagramType', [
  VoronoiDiagramType.flow,
  VoronoiDiagramType.color_flow,
])

export function isFlowMember(member) {
  return flowMembers.includes(member)
}

export const wormBehaviorAll = enumArray('WormBehavior',
  Object.values(WormBehavior).filter((m) => m !== WormBehavior.none)
)

export function isColor(space) {
  return space && space > ColorSpace.grayscale
}

export function colorSpaceMembers() {
  return enumArray('ColorSpace',
    Object.values(ColorSpace).filter((c) => isColor(c))
  )
}
