import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Plastic Wrap",
  namespace: "filter",
  func: "plasticWrap",
  tags: ["blur", "edges", "artist"],
  description: "Glossy specular plastic film hugging image contours",
  globals: {
    highlight: {
      type: "float", default: 60, uniform: "highlight",
      min: 0, max: 100, zero: 0,
      ui: { label: "highlight", control: "slider" }
    },
    detail: {
      type: "float", default: 40, uniform: "detail",
      min: 0, max: 100,
      ui: { label: "detail", control: "slider" }
    },
    smoothness: {
      type: "float", default: 30, uniform: "smoothness",
      min: 0, max: 100,
      ui: { label: "smoothness", control: "slider" }
    },
    lightDirection: {
      type: "vec3",
      default: [-0.4, 0.6, 0.7],
      uniform: "lightDirection",
      ui: { label: "direction", control: "vector3" }
    }
  },
  textures: {
    // Two internal textures: a pass cannot read and write the same texture
    // in one draw call (WebGL2 rejects this as a framebuffer/texture feedback
    // loop), so the horizontal and vertical blur stages need separate targets.
    _pwBlurH: { width: "input", height: "input", format: "rgba8unorm" },
    _pwBlur: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "blurH", program: "pwBlurH",
      inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_pwBlurH" } },
    { name: "blurV", program: "pwBlurV",
      inputs: { inputTex: "_pwBlurH" }, outputs: { fragColor: "_pwBlur" } },
    { name: "spec", program: "pwSpec",
      inputs: { inputTex: "inputTex", blurTex: "_pwBlur" },
      outputs: { fragColor: "outputTex" } }
  ]
})
