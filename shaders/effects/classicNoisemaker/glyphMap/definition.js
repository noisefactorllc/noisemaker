import { Effect } from '../../../src/runtime/effect.js'

/**
 * Glyph Map
 * Maps input values to glyph indices from an atlas texture
 */
export default new Effect({
  name: "GlyphMap",
  namespace: "classicNoisemaker",
  func: "glyphMap",
  tags: ["util"],

  description: "ASCII/glyph art conversion",
  globals: {
    colorize: {
        type: "boolean",
        default: true,
        uniform: "colorize",
        ui: {
            label: "colorize",
            control: "checkbox"
        }
    },
    zoom: {
        type: "float",
        default: 1.0,
        uniform: "zoom",
        min: 0.1,
        max: 8.0,
        step: 0.1,
        ui: {
            label: "zoom",
            control: "slider"
        }
    },
    alpha: {
        type: "float",
        default: 1.0,
        uniform: "alpha",
        min: 0.0,
        max: 1.0,
        step: 0.01,
        ui: {
            label: "alpha",
            control: "slider"
        }
    },
    glyphWidth: {
        type: "float",
        default: 8.0,
        uniform: "glyphWidth",
        min: 4.0,
        max: 64.0,
        step: 1.0,
        ui: {
            label: "glyph width"
        }
    },
    glyphHeight: {
        type: "float",
        default: 8.0,
        uniform: "glyphHeight",
        min: 4.0,
        max: 64.0,
        step: 1.0,
        ui: {
            label: "glyph height"
        }
    },
    glyphCount: {
        type: "float",
        default: 0.0,
        uniform: "glyphCount",
        min: 0.0,
        max: 256.0,
        step: 1.0,
        ui: {
            label: "glyph count (0=auto)"
        }
    },
    maskValue: {
        type: "float",
        default: 0.0,
        uniform: "maskValue",
        ui: {
            label: "mask value"
        }
    },
    splineOrder: {
        type: "int",
        default: 0.0,
        uniform: "splineOrder",
        min: 0.0,
        max: 3.0,
        step: 1.0,
        ui: {
            label: "spline order"
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "glyphMap",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
