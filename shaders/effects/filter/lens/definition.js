import { Effect } from '../../../src/runtime/effect.js'

/**
 * nu/lens - Lens distortion (barrel/pincushion)
 */
export default new Effect({
  name: "Lens",
  namespace: "filter",
  func: "lens",
  tags: ["distort", "lens"],

  description: "Barrel or pincushion lens distortion",
  globals: {
    displacement: {
      type: "float",
      default: 0,
      uniform: "lensDisplacement",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        label: "displacement",
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
  defaultProgram: "search filter, synth\n\ntestPattern(gridSize: 8)\n.lens(displacement: 0.5)\n.write(o0)",
  passes: [
    {
      name: "render",
      program: "lens",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
