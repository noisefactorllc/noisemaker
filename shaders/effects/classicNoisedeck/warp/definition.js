import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Warp",
  namespace: "classicNoisedeck",
  func: "warp",

  description: "Warp distortion",
  globals: {
    distortionType: {
      type: "int",
      default: 10,
      uniform: "distortionType",
      choices: {
        bulge: 21,
        perlin: 10,
        pinch: 20,
        polar: 0,
        spiralCw: 30,
        spiralCcw: 31,
        vortex: 1,
        waves: 2
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
    scale: {
      type: "float",
      default: 1,
      uniform: "scale",
      min: -5,
      max: 5,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    rotateAmt: {
      type: "float",
      default: 0,
      uniform: "rotateAmt",
      min: -180,
      max: 180,
      ui: {
        label: "rotation",
        control: "slider"
      }
    },
    strength: {
      type: "float",
      default: 25,
      uniform: "strength",
      min: 0,
      max: 100,
      ui: {
        label: "strength",
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
        label: "noise seed",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        clamp: 2,
        mirror: 0,
        repeat: 1
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    },
    center: {
      type: "float",
      default: 0,
      uniform: "center",
      min: -5,
      max: 5,
      ui: {
        label: "center",
        control: "slider"
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
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: -5,
      max: 5,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    rotation: {
      type: "int",
      default: 0,
      uniform: "rotation",
      min: -5,
      max: 5,
      ui: {
        label: "rot speed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "warp",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
