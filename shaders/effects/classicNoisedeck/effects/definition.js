import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Effects",
  namespace: "classicNoisedeck",
  func: "effects",
  tags: ["color", "edges", "transform"],
  openCategories: ["general", "adjustments"],

  description: "Multi-effect processor",
  globals: {
    effect: {
      type: "int",
      default: 0,
      uniform: "effect",
      choices: {
        none: 0,
        bloom: 220,
        blur: 1,
        blurSharpen: 300,
        cga: 200,
        derivatives: 120,
        derivDivide: 2,
        edge: 3,
        emboss: 4,
        litEdge: 9,
        outline: 5,
        pixels: 100,
        posterize: 110,
        shadow: 6,
        sharpen: 7,
        smoothEdge: 301,
        sobel: 8,
        subpixel: 210,
        zoomBlur: 230
      },
      ui: {
        label: "effect",
        control: "dropdown"
      }
    },
    effectAmt: {
      type: "int",
      default: 1,
      uniform: "effectAmt",
      min: 0,
      max: 20,
      ui: {
        label: "effect amt",
        control: "slider"
      }
    },
    scaleAmt: {
      type: "float",
      default: 100,
      uniform: "scaleAmt",
      min: 25,
      max: 400,
      ui: {
        label: "scale %",
        control: "slider",
        category: "transform"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "rotate",
        control: "slider",
        category: "transform"
      }
    },
    offsetX: {
      type: "float",
      default: 0,
      uniform: "offsetX",
      min: -100,
      max: 100,
      ui: {
        label: "offset x",
        control: "slider",
        category: "transform"
      }
    },
    offsetY: {
      type: "float",
      default: 0,
      uniform: "offsetY",
      min: -100,
      max: 100,
      ui: {
        label: "offset y",
        control: "slider",
        category: "transform"
      }
    },
    flip: {
      type: "int",
      default: 0,
      uniform: "flip",
      choices: {
        none: 0,
        "Flip:": null,
        all: 1,
        horizontal: 2,
        vertical: 3,
        "Mirror:": null,
        leftToRight: 11,
        rightToLeft: 12,
        upToDown: 13,
        downToUp: 14,
        lrUd: 15,
        lrDu: 16,
        rlUd: 17,
        rlDu: 18
      },
      ui: {
        label: "flip/mirror",
        control: "dropdown",
        category: "transform"
      }
    },
    intensity: {
      type: "float",
      default: 0,
      uniform: "intensity",
      min: -100,
      max: 100,
      ui: {
        label: "intensity",
        control: "slider",
        category: "adjustments"
      }
    },
    saturation: {
      type: "float",
      default: 0,
      uniform: "saturation",
      min: -100,
      max: 100,
      ui: {
        label: "saturation",
        control: "slider",
        category: "adjustments"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "effects",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
