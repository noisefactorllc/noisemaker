import { Effect } from '../../../src/runtime/effect.js'

/**
 * Color Map
 */
export default new Effect({
  name: "ColorMap",
  namespace: "filter",
  func: "colorMap",
  tags: ["color"],

  description: "Color mapping and LUT",
  globals: {
    tex: {
        type: "surface",
        default: "none",
        ui: {
            label: "color lookup texture",
            control: "surface"
        }
    },
    displacement: {
        type: "float",
        default: 0.5,
        uniform: "displacement",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "displacement",
            control: "slider"
        }
    },
    horizontal: {
        type: "boolean",
        default: false,
        uniform: "horizontal",
        ui: {
            label: "horizontal",
            control: "checkbox"
        }
    }
  },
  passes: [
    {
      name: "reduce1",
      program: "reduce1",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "reduceTex1"
      }
    },
    {
      name: "reduce2",
      program: "reduce2",
      inputs: {
        reduceTex1: "reduceTex1"
      },
      outputs: {
        fragColor: "statsTex"
      }
    },
    {
      name: "render",
      program: "colorMapRender",
      inputs: {
        inputTex: "inputTex",
        tex: "tex",
        statsTex: "statsTex"
      },
      uniforms: {
        displacement: "displacement",
        horizontal: "horizontal"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
