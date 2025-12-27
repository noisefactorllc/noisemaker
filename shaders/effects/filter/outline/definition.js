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
            euclidean: 1,
            manhattan: 2,
            chebyshev: 3,
            octagram: 4
        },
        ui: {
            label: "shape",
            control: "dropdown"
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
