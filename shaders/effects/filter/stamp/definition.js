import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/stamp - Stamp / Torn Edges: blurred-luminance threshold
 * into two flat ink/paper tones, like a rubber stamp impression.
 *
 * stBlurH -> stBlurV: separable Gaussian blur of the source,
 * radius mapped from `smoothness` (mix(0.5, 20.0, smoothness/100) px). Two
 * internal textures because a pass cannot read and write the same texture
 * (photocopy/relief precedent).
 *
 * stThreshold: t = lum(blur) + (fbm(globalCoord/3.0) - 0.5) * roughness/100
 * * 0.35 perturbs the blurred-luminance height field with tile-aware value
 * noise (value noise fbm over hash hash using an integer global pixel coordinate) so the
 * threshold contour gets ragged at roughness > 0 (Torn Edges) instead of
 * staying a clean iso-line at roughness = 0 (Stamp). b = balance/100 is the
 * threshold; aa = max(fwidth(t), 0.01) + roughness/100 * 0.05 is the
 * smoothstep half-width, widened by roughness so torn edges read as
 * slightly soft/grainy rather than crisply aliased. m = smoothstep(b - aa,
 * b + aa, t), then tonemap2(m, inkColor, paperColor) (ink/paper tonemapping: m = 1 -> paper,
 * m = 0 -> ink, so bright source regions read as blank paper and dark
 * regions read as ink - classic rubber-stamp polarity). Alpha from src.
 *
 * fbm/hash here are isotropic per-pixel value noise (no directional light,
 * no rotation, nothing fragment-coordinate-derived beyond the noise
 * coordinate itself). This pass needs no backend-specific Y compensation,
 * so GLSL and WGSL are textually identical
 * throughout (matches photocopy's DoG precedent).
 */
export default new Effect({
  name: "Stamp",
  namespace: "filter",
  func: "stamp",
  tags: ["blur", "edges", "artist"],

  description: "Two-tone ink/paper stamp impression from a blurred-luminance threshold, with a torn-edge roughness knob",
  globals: {
    smoothness: {
      type: "float", default: 30, uniform: "smoothness",
      min: 0, max: 100,
      ui: { label: "smoothness", control: "slider" }
    },
    balance: {
      type: "float", default: 50, uniform: "balance",
      min: 0, max: 100,
      ui: { label: "balance", control: "slider" }
    },
    roughness: {
      type: "float", default: 0, uniform: "roughness",
      min: 0, max: 100,
      ui: { label: "roughness", control: "slider" }
    },
    inkColor: {
      type: "color", default: [0.1, 0.1, 0.1], uniform: "inkColor",
      ui: { label: "ink color", control: "color" }
    },
    paperColor: {
      type: "color", default: [0.96, 0.94, 0.88], uniform: "paperColor",
      ui: { label: "paper color", control: "color" }
    }
  },
  textures: {
    // Two internal textures: a pass cannot read and write the same texture
    // in one draw call (WebGL2 rejects this as a framebuffer/texture feedback
    // loop), so the horizontal and vertical blur stages need separate targets.
    _stBlurH: { width: "input", height: "input", format: "rgba8unorm" },
    _stBlur: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "blurH", program: "stBlurH",
      inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_stBlurH" } },
    { name: "blurV", program: "stBlurV",
      inputs: { inputTex: "_stBlurH" }, outputs: { fragColor: "_stBlur" } },
    { name: "threshold", program: "stThreshold",
      inputs: { inputTex: "inputTex", blurTex: "_stBlur" },
      outputs: { fragColor: "outputTex" } }
  ]
})
