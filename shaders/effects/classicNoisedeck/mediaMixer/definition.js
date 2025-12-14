import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "MediaMixer",
  namespace: "classicNoisedeck",
  func: "mediaMixer",
  tags: ["util", "color"],

  description: "Media blending and mixing",
  externalTexture: "imageTex",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
      ui: {
        label: "source surface B"
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
    mixDirection: {
      type: "int",
      default: 0,
      uniform: "mixDirection",
      choices: {
        size12: 0,
        size21: 1
      },
      ui: {
        label: "mix",
        control: "dropdown"
      }
    },
    cutoff: {
      type: "float",
      default: 100,
      uniform: "cutoff",
      min: 0,
      max: 100,
      ui: {
        label: "cutoff",
        control: "slider"
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
      min: 1,
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
    }
  },
  passes: [
    {
      name: "render",
      program: "mediaMixer",
      inputs: {
              inputTex: "inputTex",
              tex: "tex",
              imageTex: "imageTex"
            }
,
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
