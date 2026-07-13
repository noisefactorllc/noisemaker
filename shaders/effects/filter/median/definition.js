import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Median",
  namespace: "filter",
  func: "median",
  tags: ["blur", "artist"],
  description: "Exact dense 3x3, 5x5, or 7x7 brightness-ranked median with Dust & Scratches threshold gate",
  globals: {
    radius: {
      type: "int", default: 3, define: "RADIUS",
      min: 1, max: 3, step: 1,
      ui: { label: "radius", control: "slider" }
    },
    threshold: {
      type: "float", default: 0, uniform: "threshold",
      min: 0, max: 100,
      ui: { label: "threshold", control: "slider" }
    }
  },
  passes: [
    { name: "median", program: "median",
      inputs: { inputTex: "inputTex" },
      outputs: { fragColor: "outputTex" } }
  ]
})
