import { Effect } from '../../../src/runtime/effect.js'

/**
 * ValueRefract - noise-driven refraction distortion
 */
export default new Effect({
  name: "ValueRefract",
  namespace: "classicNoisemaker",
  tags: ["distort"],
  func: "valueRefract",

  description: "Value-based refraction",
  globals: {
    displacement: {
      type: "float",
      default: 0.5,
      uniform: "displacement",
      min: 0,
      max: 2,
      step: 0.01,
      ui: {
        label: "displacement",
        control: "slider"
      }
    },
    freq: {
      type: "float",
      default: 4.0,
      uniform: "freq",
      min: 0.1,
      max: 20,
      step: 0.1,
      ui: {
        label: "frequency",
        control: "slider"
      }
    }
  },
  paramAliases: { frequency: 'freq' },
  passes: [
    {
      name: "main",
      program: "valueRefract",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        displacement: "displacement",
        freq: "freq"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
