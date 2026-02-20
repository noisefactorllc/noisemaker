import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/tunnel - Perspective tunnel effect
 * Based on Inigo Quilez's tunnel shader
 */
export default new Effect({
  name: "Tunnel",
  namespace: "filter",
  func: "tunnel",
  tags: ["distort"],

  description: "Perspective tunnel effect with shape options",
  globals: {
    shape: {
      type: "int",
      default: 0,
      uniform: "shape",
      choices: {
        circle: 0,
        triangle: 1,
        square: 2,
        hexagon: 3,
        octagon: 4
      },
      ui: {
        label: "shape",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 0,
      uniform: "tunnelScale",
      min: -2,
      max: 2,
      step: 0.1,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1,
      uniform: "speed",
      min: -5,
      max: 5,
      step: 0.1,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "tunnelRotation",
      min: -2,
      max: 2,
      step: 0.1,
      ui: {
        label: "rot speed",
        control: "slider"
      }
    },
    aspectLens: {
      type: "boolean",
      default: true,
      uniform: "aspectLens",
      ui: {
        label: "1:1 aspect",
        control: "checkbox"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "tunnel",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
