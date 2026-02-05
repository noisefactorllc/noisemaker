import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Tunnel",
  namespace: "classicNoisedeck",
  func: "tunnel",
  tags: ["distort", "transform", "geometric"],

  description: "Tunnel perspective effect",
  globals: {
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider",
        category: "util"
      }
    },
    distortionType: {
      type: "int",
      default: 0,
      uniform: "distortionType",
      choices: {
        circle: 0,
        triangle: 1,
        roundedSquare: 2,
        square: 3,
        hexagon: 4,
        octagon: 5
      },
      ui: {
        label: "type",
        control: "dropdown"
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
        control: "dropdown"
      }
    },
    speed: {
      type: "float",
      default: 1,
      uniform: "speed",
      min: -5,
      max: 5,
      ui: {
        label: "speed",
        control: "slider",
        category: "animation"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -5,
      max: 5,
      ui: {
        label: "rotation",
        control: "slider",
        category: "transform"
      }
    },
    center: {
      type: "float",
      default: -5,
      uniform: "center",
      min: -5,
      max: 5,
      ui: {
        label: "center",
        control: "slider",
        category: "transform"
      }
    },
    scale: {
      type: "float",
      default: 0,
      uniform: "scale",
      min: -5,
      max: 5,
      ui: {
        label: "scale",
        control: "slider",
        category: "transform"
      }
    },
    aspectLens: {
      type: "boolean",
      default: true,
      uniform: "aspectLens",
      ui: {
        label: "1:1 aspect",
        control: "checkbox"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "tunnel",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
