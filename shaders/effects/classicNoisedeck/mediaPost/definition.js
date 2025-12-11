import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "MediaPost",
  namespace: "classicNoisedeck",
  func: "mediaPost",

  description: "Media post-processing",
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
    source: {
      type: "int",
      default: 1,
      uniform: "source",
      choices: {
        camera: 0,
        file: 1
      },
      ui: {
        label: "source",
        control: "dropdown"
      }
    },
    position: {
      type: "int",
      default: 4,
      uniform: "position",
      choices: {
        topLeft: 0,
        topCenter: 1,
        topRight: 2,
        midLeft: 3,
        midCenter: 4,
        midRight: 5,
        bottomLeft: 6,
        bottomCenter: 7,
        bottomRight: 8
      },
      ui: {
        label: "position",
        control: "dropdown",
        category: "orientation"
      }
    },
    tiling: {
      type: "int",
      default: 0,
      uniform: "tiling",
      choices: {
        none: 0,
        horizAndVert: 1,
        horizOnly: 2,
        vertOnly: 3
      },
      ui: {
        label: "tiling",
        control: "dropdown",
        category: "orientation"
      }
    },
    scaleAmt: {
      type: "float",
      default: 100,
      uniform: "scaleAmt",
      min: 25,
      max: 2000,
      ui: {
        label: "scale %",
        control: "slider",
        category: "transform"
      }
    },
    rotation: {
      type: "int",
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
    imageSize: {
      type: "vec2",
      default: [1280, 720],
      uniform: "imageSize",
      ui: {
        control: false
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "mediaPost",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
