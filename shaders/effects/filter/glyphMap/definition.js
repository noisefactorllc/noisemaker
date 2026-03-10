import { Effect } from '../../../src/runtime/effect.js'

/**
 * Glyph Map
 * Converts image to ASCII/glyph art using procedural glyph patterns
 */
export default new Effect({
  name: "Glyph Map",
  namespace: "filter",
  func: "glyphMap",
  tags: ["color", "pixel"],

  description: "ASCII/glyph art conversion using procedural glyphs",
  globals: {
    cellSize: {
      type: "int",
      default: 8,
      uniform: "cellSize",
      min: 4,
      max: 32,
      ui: {
        label: "cell size",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    color: {
      type: "boolean",
      default: true,
      uniform: "color",
      ui: {
        label: "color",
        control: "checkbox"
      }
    }
  },
  passes: [
    {
      name: "render",
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
