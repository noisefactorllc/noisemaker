import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/adjust - Combined color adjustment
 * Colorspace reinterpretation, hue/saturation, and brightness/contrast in one pass
 */
export default new Effect({
  name: "Adjust",
  namespace: "filter",
  func: "adjust",
  tags: ["color"],

  description: "Colorspace, hue/saturation, brightness/contrast",
  defaultProgram: "search filter, synth\n\nperlin(scale: 75, octaves: 2)\n.adjust(mode: hsv, rotation: 120, hueRange: 40)\n.write(o0)",
  openCategories: ["colorspace", "hue / saturation", "brightness / contrast"],
  globals: {
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        rgb: 0,
        hsv: 1,
        oklab: 2,
        oklch: 3
      },
      ui: {
        label: "mode",
        control: "dropdown",
        category: "colorspace"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "hue rotation",
        control: "slider",
        category: "hue / saturation"
      }
    },
    hueRange: {
      type: "float",
      default: 100,
      uniform: "hueRange",
      min: 0,
      max: 200,
      ui: {
        label: "hue range",
        control: "slider",
        category: "hue / saturation"
      }
    },
    saturation: {
      type: "float",
      default: 1,
      uniform: "saturation",
      min: 0,
      max: 4,
      ui: {
        label: "saturation",
        control: "slider",
        category: "hue / saturation"
      }
    },
    brightness: {
      type: "float",
      default: 1,
      uniform: "brightness",
      min: 0,
      max: 10,
      randChance: 0,
      ui: {
        label: "brightness",
        control: "slider",
        category: "brightness / contrast"
      }
    },
    contrast: {
      type: "float",
      default: 0.5,
      uniform: "contrast",
      min: 0,
      max: 1,
      randChance: 0,
      ui: {
        label: "contrast",
        control: "slider",
        category: "brightness / contrast"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "adjust",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
