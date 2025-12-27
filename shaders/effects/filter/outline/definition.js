import { Effect } from '../../../src/runtime/effect.js'

/**
 * Outline
 * Multi-pass edge detection that darkens the base image where edges are detected
 */
export default new Effect({
  name: "Outline",
  namespace: "filter",
  tags: ["edges"],
  func: "outline",

  description: "Outline/edge stroke",
  globals: {
    shape: {
        type: "int",
        default: 1,
        uniform: "sobelMetric",
        choices: {
            circle: 1,
            diamond: 2,
            square: 3,
            octagon: 4
        },
        ui: {
            label: "shape",
            control: "dropdown"
        }
    },
    thickness: {
        type: "float",
        default: 1.0,
        uniform: "thickness",
        min: 1.0,
        max: 10.0,
        step: 0.1,
        ui: {
            label: "Thickness",
            control: "slider"
        }
    },
    invert: {
        type: "boolean",
        default: false,
        uniform: "invert",
        ui: {
            label: "Invert",
            control: "checkbox"
        }
    }
  },
  textures: {
    outlineValueMap: { width: "100%", height: "100%", format: "rgba16f" },
    outlineEdges: { width: "100%", height: "100%", format: "rgba16f" }
  },
  passes: [
    {
      name: "valueMap",
      program: "outlineValueMap",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outlineValueMap"
      }
    },
    {
      name: "sobel",
      program: "outlineSobel",
      inputs: {
        valueTexture: "outlineValueMap"
      },
      outputs: {
        color: "outlineEdges"
      }
    },
    {
      name: "blend",
      program: "outlineBlend",
      inputs: {
        inputTex: "inputTex",
        edgesTexture: "outlineEdges"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
