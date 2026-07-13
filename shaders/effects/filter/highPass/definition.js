import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "High Pass",
  namespace: "filter",
  func: "highPass",
  tags: ["edges", "artist"],
  description: "High-pass filter isolating edge detail as a flat mid-gray field",
  globals: {
    radius: {
      type: "float", default: 10, uniform: "radius",
      min: 0.5, max: 100, step: 0.5,
      ui: { label: "radius", control: "slider" }
    },
    mono: {
      type: "boolean", default: false, uniform: "mono",
      ui: { label: "mono", control: "checkbox" }
    }
  },
  textures: {
    // Two internal textures: a pass cannot read and write the same texture
    // in one draw call (WebGL2 rejects this as a framebuffer/texture feedback
    // loop), so the horizontal and vertical blur stages need separate targets.
    _hpBlurH: { width: "input", height: "input", format: "rgba8unorm" },
    _hpBlur: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "blurH", program: "hpBlurH",
      inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_hpBlurH" } },
    { name: "blurV", program: "hpBlurV",
      inputs: { inputTex: "_hpBlurH" }, outputs: { fragColor: "_hpBlur" } },
    { name: "combine", program: "hpCombine",
      inputs: { inputTex: "inputTex", blurTex: "_hpBlur" },
      outputs: { fragColor: "outputTex" } }
  ]
})
