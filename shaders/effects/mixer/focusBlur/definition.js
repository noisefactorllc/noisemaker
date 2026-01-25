import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Focus Blur",
  namespace: "mixer",
  func: "focusBlur",
  tags: ["blend", "blur"],

  description: "Focus blur using luminance depth map",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "source B"
      }
    },
    focalDistance: {
      type: "float",
      default: 50,
      uniform: "focalDistance",
      min: 1,
      max: 100,
      randMin: 5,
      randMax: 75,
      ui: {
        label: "focal dist",
        control: "slider"
      }
    },
    aperture: {
      type: "float",
      default: 4,
      uniform: "aperture",
      min: 1,
      max: 10,
      randMax: 3,
      ui: {
        label: "aperture",
        control: "slider"
      }
    },
    sampleBias: {
      type: "float",
      default: 10,
      uniform: "sampleBias",
      min: 2,
      max: 20,
      ui: {
        label: "sample spread",
        control: "slider"
      }
    },
    depthSource: {
      type: "int",
      default: 1,
      uniform: "depthSource",
      choices: {
        sourceA: 0,
        sourceB: 1
      },
      ui: {
        label: "depth source",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "focusBlur",
      inputs: {
        inputTex: "inputTex",
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
