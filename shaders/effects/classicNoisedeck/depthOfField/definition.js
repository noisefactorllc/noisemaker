import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "DepthOfField",
  namespace: "classicNoisedeck",
  func: "depthOfField",
  tags: ["blur"],

  description: "Depth of field blur simulation",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    focalDistance: { slot: 1, components: 'x' },
    aperture: { slot: 1, components: 'y' },
    sampleBias: { slot: 1, components: 'z' },
    mapSource: { slot: 1, components: 'w' }
  },
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "depth map"
      }
    },
    focalDistance: {
      type: "float",
      default: 50,
      uniform: "focalDistance",
      min: 1,
      max: 100,
      ui: {
        label: "focal dist",
        control: "slider"
      }
    },
    aperture: {
      type: "float",
      default: 4,
      uniform: "aperture",
      min: 1,
      max: 10,
      ui: {
        label: "aperture",
        control: "slider"
      }
    },
    sampleBias: {
      type: "float",
      default: 10,
      uniform: "sampleBias",
      min: 2,
      max: 20,
      ui: {
        label: "sample bias",
        control: "slider"
      }
    },
    mapSource: {
      type: "int",
      default: 1,
      uniform: "mapSource",
      choices: {
        "inputTex": 0,
        "tex": 1
      },
      ui: {
        label: "depth source",
        control: "dropdown"
      }
    }
  },
  paramAliases: { depthSource: 'mapSource' },
  passes: [
    {
      name: "render",
      program: "depthOfField",
      inputs: {
              inputTex: "inputTex",
              tex: "tex"
            }
,
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
