import { Effect } from '../../../src/runtime/effect.js'

/**
 * Clouds - Cloud texture overlay
 *
 * Single-pass ridged multi-octave simplex noise composited
 * as white clouds with offset shadow onto the input.
 */
export default new Effect({
  name: "Clouds",
  namespace: "filter",
  func: "clouds",
  tags: ["noise"],

  description: "Cloud texture overlay",
  globals: {
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
    scale: {
      type: "float",
      default: 0.25,
      uniform: "scale",
      min: 0.1,
      max: 1.0,
      step: 0.05,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 0,
      uniform: "speed",
      min: 0,
      max: 4,
      zero: 0,
      randMax: 2,
      ui: { label: "speed", control: "slider" }
    }
  },
  defaultProgram: "search filter, synth\n\nsolid(color: #2d78f0)\n.clouds(scale: 0.55)\n.write(o0)",
  passes: [
    {
      name: "render",
      program: "clouds",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        seed: "seed",
        scale: "scale",
        speed: "speed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
