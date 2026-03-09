import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/glowingEdge - Glowing edge detection
 * Single-pass edge glow effect based on Sobel edge detection
 */
export default new Effect({
  name: "Glowing Edge",
  namespace: "filter",
  func: "glowingEdge",
  tags: ["edges"],

  description: "Glowing edge detection",
  globals: {
    shape: {
      type: "int",
      default: 0,
      uniform: "sobelMetric",
      choices: {
        "circle": 0,
        "diamond": 1,
        "square": 2,
        "star": 3
      },
      ui: {
        label: "shape",
        control: "dropdown"
      }
    },
    alpha: {
      type: "float",
      default: 1,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.05,
      ui: {
        label: "alpha",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "glowingEdge",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        shape: "sobelMetric",
        alpha: "alpha"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
