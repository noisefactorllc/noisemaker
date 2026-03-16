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
    pause: {
      type: "boolean",
      default: false,
      uniform: "pause",
      ui: {
        label: "pause",
        control: "checkbox"
      }
    },
    density: {
      type: "float",
      default: 75,
      uniform: "density",
      min: 0,
      max: 100,
      ui: {
        label: "density",
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
        pause: "pause",
        density: "density"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
