import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Curl",
  namespace: "synth",
  func: "curl",
  tags: ["noise", "flow"],

  description: "3D curl noise using simplex noise",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    aspectRatio: { slot: 0, components: 'w' },
    scale: { slot: 1, components: 'x' },
    seed: { slot: 1, components: 'y' },
    speed: { slot: 1, components: 'z' },
    octaves: { slot: 1, components: 'w' },
    ridges: { slot: 2, components: 'x' },
    outputMode: { slot: 2, components: 'y' }
  },
  globals: {
    scale: {
      type: "float",
      default: 4.0,
      uniform: "scale",
      min: 0.5,
      max: 20,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    seed: {
      type: "float",
      default: 0,
      uniform: "seed",
      min: 0,
      max: 1000,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    octaves: {
      type: "int",
      default: 1,
      uniform: "octaves",
      min: 1,
      max: 3,
      ui: {
        label: "octaves",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 0.5,
      uniform: "speed",
      min: 0,
      max: 5,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    ridges: {
      type: "bool",
      default: false,
      uniform: "ridges",
      ui: {
        label: "ridges",
        control: "checkbox"
      }
    },
    outputMode: {
      type: "int",
      default: 3,
      uniform: "outputMode",
      choices: {
        flowX: 0,
        flowY: 1,
        flowZ: 2,
        full: 3,
        magnitude: 4
      },
      ui: {
        label: "output",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "curl",
      inputs: {},
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
