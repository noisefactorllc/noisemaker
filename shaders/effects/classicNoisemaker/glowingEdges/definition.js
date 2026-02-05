import { Effect } from '../../../src/runtime/effect.js'

/**
 * Glowing Edges
 * Single-pass edge glow effect based on Sobel edge detection
 */
export default new Effect({
  name: "GlowingEdges",
  namespace: "classicNoisemaker",
  func: "glowingEdges",
  tags: ["util"],

  description: "Glowing edge detection",
  globals: {
    shape: {
        type: "int",
        default: 1,
        uniform: "sobelMetric",
        min: 1,
        max: 4,
        step: 1,
        ui: {
            label: "shape"
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
      program: "glowingEdges",
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
