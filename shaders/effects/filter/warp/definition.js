import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/warp - Perlin noise-based warp distortion
 * Direct port of nd.warp's perlin mode
 */
export default new Effect({
  name: "Warp",
  namespace: "filter",
  func: "warp",
  globals: {
    strength: {
      type: "float",
      default: 25,
      uniform: "strength",
      min: 0,
      max: 100,
      ui: {
        label: "Strength",
        control: "slider"
      }
    },
    scale: {
      type: "float",
      default: 1,
      uniform: "scale",
      min: 0.1,
      max: 5,
      step: 0.1,
      ui: {
        label: "Scale",
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
        label: "Seed",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 0,
      uniform: "speed",
      min: 0,
      max: 2,
      step: 0.01,
      ui: {
        label: "Speed",
        control: "slider"
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
});
