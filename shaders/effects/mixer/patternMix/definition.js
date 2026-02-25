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
      default: 7,
      uniform: "patternType",
      choices: {
        checkerboard: 0,
        concentricRings: 1,
        dots: 2,
        grid: 3,
        hexagons: 4,
        radialLines: 5,
        spiral: 6,
        stripes: 7,
        triangularGrid: 8
      },
      ui: {
        label: "pattern type",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 18.0,
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
      default: 0.01,
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
