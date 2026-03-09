import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Fibers",
  namespace: "filter",
  func: "fibers",
  tags: ["noise"],
  description: "Chaotic fiber texture overlay",
  globals: {
    density: {
      type: "float", default: 0.5, uniform: "density",
      min: 0, max: 1, step: 0.01,
      ui: { label: "density", control: "slider" }
    },
    seed: {
      type: "int", default: 1, uniform: "seed",
      min: 1, max: 100, step: 1,
      ui: { label: "seed", control: "slider" }
    },
    alpha: {
      type: "float", default: 0.5, uniform: "alpha",
      min: 0, max: 1, step: 0.01,
      ui: { label: "alpha", control: "slider" }
    }
  },
  passes: [
    {
      name: "main",
      program: "fibers",
      inputs: { inputTex: "inputTex" },
      uniforms: { density: "density", seed: "seed", alpha: "alpha" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
