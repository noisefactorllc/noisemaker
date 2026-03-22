import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "CRT",
  namespace: "filter",
  func: "crt",
  tags: ["distort"],
  description: "CRT monitor simulation",
  globals: {
    alpha: {
      type: "float",
      default: 0.5,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      zero: 0,
      ui: {
        label: "alpha",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0.0,
      max: 5.0,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      min: 1,
      max: 100,
      step: 1,
      uniform: "seed",
      ui: {
        label: "seed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "crt",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha",
        speed: "speed",
        seed: "seed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
