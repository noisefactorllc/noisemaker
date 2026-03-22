import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/warp - Perlin noise-based warp distortion
 * Direct port of nd.warp's perlin mode
 */
export default new Effect({
  name: "Warp",
  namespace: "filter",
  func: "warp",
  tags: ["distort"],

  description: "Perlin noise-based warp distortion",
  globals: {
    strength: {
      type: "float",
      default: 75,
      uniform: "strength",
      min: 0,
      max: 100,
      zero: 0,
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    scale: {
      type: "float",
      default: 1,
      uniform: "scale",
      min: 0,
      max: 5,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 0,
      uniform: "speed",
      min: 0,
      max: 5,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1,
        clamp: 2
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "rotation",
        control: "slider"
      }
    },
    antialias: {
      type: "boolean",
      default: true,
      uniform: "antialias",
      ui: {
        label: "antialias",
        control: "checkbox"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "warp",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
