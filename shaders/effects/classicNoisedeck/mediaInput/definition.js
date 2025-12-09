import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "MediaInput",
  namespace: "classicNoisedeck",
  func: "mediaInput",

  description: "Media input source",
  externalTexture: "imageTex",
  uniformLayout: {
        resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    posIndex: { slot: 1, components: 'x' },
    rotation: { slot: 1, components: 'y' },
    scaleAmt: { slot: 1, components: 'z' },
    offsetX: { slot: 1, components: 'w' },
    offsetY: { slot: 2, components: 'x' },
    tiling: { slot: 2, components: 'y' },
    flip: { slot: 2, components: 'z' },
    backgroundOpacity: { slot: 2, components: 'w' },
    backgroundColor: { slot: 3, components: 'xyz' },
    imageSize: { slot: 4, components: 'xy' }
  },
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
        control: "dropdown",
        category: "general"
      }
    },
    file: {
      type: "file",
      default: null,
      uniform: "file",
      ui: {
        label: "media file",
        control: "slider",
        category: "general"
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
        category: "orientation"
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
    backgroundColor: {
      type: "vec3",
      default: [0.0, 0.0, 0.0],
      uniform: "backgroundColor",
      ui: {
        label: "bkg color",
        control: "color",
        category: "background"
      }
    },
    backgroundOpacity: {
      type: "float",
      default: 0,
      uniform: "backgroundOpacity",
      min: 0,
      max: 100,
      ui: {
        label: "bkg opacity",
        control: "slider",
        category: "background"
      }
    },
    imageSize: {
      type: "vec2",
      default: [1024, 1024],
      uniform: "imageSize",
      ui: {
        label: "image size",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "mediaInput",
      inputs: {
        imageTex: "imageTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
