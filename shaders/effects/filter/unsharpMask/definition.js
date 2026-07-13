import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Unsharp Mask",
  namespace: "filter",
  func: "unsharpMask",
  tags: ["edges", "artist"],
  description: "Classic unsharp mask sharpening with radius and threshold",
  globals: {
    amount: {
      type: "float", default: 220, uniform: "amount",
      min: 0, max: 500, zero: 0,
      ui: { label: "amount", control: "slider" }
    },
    radius: {
      type: "float", default: 4, uniform: "radius",
      min: 0.5, max: 50, step: 0.5,
      ui: { label: "radius", control: "slider" }
    },
    threshold: {
      type: "float", default: 0, uniform: "threshold",
      min: 0, max: 100,
      ui: { label: "threshold", control: "slider" }
    }
  },
  textures: {
    // Two internal textures: a pass cannot read and write the same texture
    // in one draw call (WebGL2 rejects this as a framebuffer/texture feedback
    // loop), so the horizontal and vertical blur stages need separate targets.
    _usmBlurH: { width: "input", height: "input", format: "rgba8unorm" },
    _usmBlur: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "blurH", program: "usmBlurH",
      inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_usmBlurH" } },
    { name: "blurV", program: "usmBlurV",
      inputs: { inputTex: "_usmBlurH" }, outputs: { fragColor: "_usmBlur" } },
    { name: "combine", program: "usmCombine",
      inputs: { inputTex: "inputTex", blurTex: "_usmBlur" },
      outputs: { fragColor: "outputTex" } }
  ]
})
