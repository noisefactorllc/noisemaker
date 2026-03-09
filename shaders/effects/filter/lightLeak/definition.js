import { Effect } from '../../../src/runtime/effect.js'

/**
 * Light Leak - Film light leak overlay with Voronoi-based color regions
 */
export default new Effect({
  name: "Light Leak",
  namespace: "filter",
  func: "lightLeak",
  tags: ["color"],

  description: "Film light leak overlay with colorful Voronoi regions",
  globals: {
    alpha: {
      type: "float",
      default: 0.25,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    },
    color: {
      type: "color",
      default: [1.0, 0.8, 0.3],
      uniform: "color",
      ui: {
        label: "color",
        control: "color"
      }
    },
    speed: {
      type: "float",
      default: 0.5,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.01,
      ui: {
        label: "speed",
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
    }
  },
  passes: [
    {
      name: "main",
      program: "lightLeak",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        alpha: "alpha",
        color: "color",
        speed: "speed",
        seed: "seed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
