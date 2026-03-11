import { Effect } from '../../../src/runtime/effect.js'

/**
 * Spatter - Paint spatter effect with multi-layer procedural noise
 */
export default new Effect({
  name: "Spatter",
  namespace: "filter",
  func: "spatter",
  tags: ["noise"],

  description: "Paint spatter effect",
  globals: {
    color: {
      type: "color",
      default: [0.875, 0.125, 0.125],
      uniform: "color",
      ui: {
        label: "color",
        control: "color"
      }
    },
    density: {
      type: "float",
      default: 0.5,
      uniform: "density",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "density",
        control: "slider"
      }
    },
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
    }
  },
  defaultProgram: "search filter, synth\n\nsolid(color: #d4d4d4)\n  .spatter(density: 1)\n  .write(o0)",
  passes: [
    {
      name: "main",
      program: "spatter",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        color: "color",
        density: "density",
        alpha: "alpha",
        seed: "seed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
