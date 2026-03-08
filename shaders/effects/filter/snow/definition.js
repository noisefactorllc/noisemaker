import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Snow",
  namespace: "filter",
  func: "snow",
  tags: ["noise"],
  description: "TV snow/static noise",
  globals: {
    alpha: {
      type: "float",
      default: 0.25,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "snow",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha",
        speed: "speed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
