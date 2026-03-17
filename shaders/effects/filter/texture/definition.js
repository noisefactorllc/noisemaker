import { Effect } from '../../../src/runtime/effect.js'

/**
 * Texture
 * Animated ridged noise texture overlay
 */
export default new Effect({
  name: "Texture",
  namespace: "filter",
  func: "texture",
  tags: ["noise"],

  description: "Texture overlay blend",
  globals: {
    mode: {
        type: "int",
        default: 3,
        uniform: "mode",
        choices: {
            "canvas": 0,
            "crosshatch": 1,
            "halftone": 2,
            "paper": 3,
            "stucco": 4
        },
        ui: {
            label: "mode",
            control: "dropdown"
        }
    },
    alpha: {
        type: "float",
        default: 0.5,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "alpha",
            control: "slider"
        }
    },
    scale: {
        type: "float",
        default: 1.0,
        uniform: "scale",
        min: 0.1,
        max: 10,
        step: 0.1,
        randMax: 4,
        ui: {
            label: "scale",
            control: "slider"
        }
    }
  },
  defaultProgram: "search filter, synth\n\nsolid(color: #d1d1d1)\n  .texture(alpha: 0.75)\n  .write(o0)",
  passes: [
    {
      name: "main",
      program: "texture",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha",
        scale: "scale"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
