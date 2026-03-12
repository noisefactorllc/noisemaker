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
        roundedRect: 2,
        square: 3,
        hexagon: 4,
        octagon: 5
      },
      ui: {
        label: "shape",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 0,
      uniform: "scale",
      min: -1,
      max: 1,
      step: 0.1,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: -5,
      max: 5,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    rotation: {
      type: "int",
      default: 0,
      uniform: "rotation",
      min: -2,
      max: 2,
      ui: {
        label: "rot speed",
        control: "slider"
      }
    },
    center: {
      type: "float",
      default: 0,
      uniform: "center",
      min: -100,
      max: 100,
      ui: {
        label: "center",
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
