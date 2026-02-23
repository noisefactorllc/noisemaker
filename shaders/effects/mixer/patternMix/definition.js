import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "PatternMix",
  namespace: "mixer",
  func: "patternMix",
  tags: ["blend", "pattern"],

  description: "Mix inputs using geometric patterns",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    type: {
      type: "int",
      default: 0,
      uniform: "patternType",
      choices: {
        stripes: 0,
        checkerboard: 1,
        grid: 2,
        dots: 3,
        hexagons: 4,
        diamonds: 5
      },
      ui: {
        label: "pattern type",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 15.0,
      uniform: "scale",
      min: 1,
      max: 20,
      ui: { label: "scale", control: "slider" }
    },
    thickness: {
      type: "float",
      default: 0.5,
      uniform: "thickness",
      min: 0,
      max: 1,
      ui: { label: "thickness", control: "slider" }
    },
    smoothness: {
      type: "float",
      default: 0.02,
      uniform: "smoothness",
      min: 0,
      max: 0.25,
      zero: 0,
      ui: { label: "smoothness", control: "slider" }
    },
    rotation: {
      type: "float",
      default: 0.0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: { label: "rotation", control: "slider" }
    },
    invert: {
      type: "int",
      default: 0,
      uniform: "invert",
      choices: {
        off: 0,
        on: 1
      },
      ui: {
        label: "swap a/b",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "patternMix",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
