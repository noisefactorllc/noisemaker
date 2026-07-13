import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/relief - blurred-luminance relief shading with three modes:
 *
 * basRelief (0): classic two-tone carved relief - a directional-light
 * shade of the blurred height field, blended with the raw height and
 * tonemapped between inkColor/paperColor.
 *
 * plaster (1): the height field is pushed through a hard smoothstep
 * (blobby, mostly-flat plateaus) and inverted (dark source areas read as
 * raised), then lit with a squared (glossier, narrower) shade term -
 * a smooth molded look.
 *
 * notePaper (2): the raw height field is hard-thresholded at `balance`
 * into two flat paper sheets (no gradient blend), with a directional
 * bevel shade applied only in a ~2px band around the threshold contour
 * and a per-pixel hash grain added for flat cutout layers with beveled edges.
 *
 * Separable blur topology (rlBlurH -> rlBlurV -> rlShade) matches
 * filter/plasticWrap/filter/unsharpMask's precedent: two internal
 * textures because a pass cannot read and write the same texture.
 */
export default new Effect({
  name: "Relief",
  namespace: "filter",
  func: "relief",
  tags: ["blur", "edges", "artist"],

  description: "Two-tone ink/paper relief carving: Bas Relief, Plaster, and Note Paper sketch renderings",
  globals: {
    mode: {
      type: "int", default: 0, define: "MODE",
      choices: {
        basRelief: 0,
        plaster: 1,
        notePaper: 2
      },
      ui: { label: "mode", control: "dropdown" }
    },
    smoothness: {
      type: "float", default: 30, uniform: "smoothness",
      min: 0, max: 100,
      ui: { label: "smoothness", control: "slider" }
    },
    detail: {
      type: "float", default: 50, uniform: "detail",
      min: 0, max: 100,
      ui: { label: "detail", control: "slider" }
    },
    lightAngle: {
      type: "float", default: 135, uniform: "lightAngle",
      min: -180, max: 180,
      ui: { label: "light angle", control: "slider" }
    },
    balance: {
      type: "float", default: 50, uniform: "balance",
      min: 0, max: 100,
      ui: {
        label: "balance", control: "slider",
        enabledBy: { param: "mode", eq: 2 }
      }
    },
    graininess: {
      type: "float", default: 30, uniform: "graininess",
      min: 0, max: 100,
      ui: {
        label: "graininess", control: "slider",
        enabledBy: { param: "mode", eq: 2 }
      }
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
    _rlBlurH: { width: "input", height: "input", format: "rgba8unorm" },
    _rlBlur: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "blurH", program: "rlBlurH",
      inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_rlBlurH" } },
    { name: "blurV", program: "rlBlurV",
      inputs: { inputTex: "_rlBlurH" }, outputs: { fragColor: "_rlBlur" } },
    { name: "shade", program: "rlShade",
      inputs: { inputTex: "inputTex", blurTex: "_rlBlur" },
      outputs: { fragColor: "outputTex" } }
  ]
})
