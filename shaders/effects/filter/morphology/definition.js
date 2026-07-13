import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Morphology",
  namespace: "filter",
  func: "morphology",
  tags: ["blur", "artist"],
  description: "Grayscale morphology dilate/erode (Maximum/Minimum)",
  globals: {
    mode: {
      type: "int", default: 0, uniform: "mode",
      choices: { dilate: 0, erode: 1 },
      ui: { label: "mode", control: "dropdown" }
    },
    radius: {
      type: "float", default: 4, uniform: "radius",
      min: 1, max: 32,
      ui: { label: "radius", control: "slider" }
    },
    shape: {
      type: "int", default: 0, define: "SHAPE",
      choices: { square: 0, round: 1 },
      ui: { label: "shape", control: "dropdown" }
    }
  },
  textures: {
    // Single internal texture: a pass cannot read and write the same texture
    // in one draw call (WebGL2 rejects this as a framebuffer/texture feedback
    // loop), so the square shape's horizontal and vertical structuring-element
    // passes need separate targets. The round shape only uses morphA (full
    // disc structuring element); morphB is a passthrough copy for that shape.
    _morphTmp: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "morphA", program: "morphA",
      inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_morphTmp" } },
    { name: "morphB", program: "morphB",
      inputs: { inputTex: "_morphTmp" }, outputs: { fragColor: "outputTex" } }
  ]
})
