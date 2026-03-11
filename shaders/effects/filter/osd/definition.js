import { Effect } from '../../../src/runtime/effect.js'

/**
 * OSD
 * On-screen display overlay with procedural pseudo-glyph readout
 */
export default new Effect({
  name: "OSD",
  namespace: "filter",
  func: "osd",
  tags: ["text"],

  description: "On-screen display overlay",
  globals: {
    alpha: {
        type: "float",
        default: 0.75,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "alpha",
            control: "slider"
        }
    },
    seed: {
        type: "int",
        default: 1,
        uniform: "seed",
        min: 1,
        max: 100,
        step: 1,
        ui: {
            label: "seed",
            control: "slider"
        }
    },
    speed: {
        type: "float",
        default: 0.0,
        uniform: "speed",
        min: 0,
        max: 50,
        step: 0.1,
        ui: {
            label: "speed",
            control: "slider"
        }
    },
    corner: {
        type: "int",
        default: 3,
        uniform: "corner",
        choices: {
            topLeft: 0,
            topRight: 1,
            bottomLeft: 2,
            bottomRight: 3
        },
        ui: {
            label: "position",
            control: "dropdown"
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "osd",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha",
        seed: "seed",
        speed: "speed",
        corner: "corner"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
