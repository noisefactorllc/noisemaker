import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Curl",
  namespace: "synth",
  func: "curl",
  tags: ["noise"],

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
    outputMode: { slot: 2, components: 'y' },
    intensity: { slot: 2, components: 'z' }
  },
  globals: {
    scale: {
      type: "float",
      default: 16,
      uniform: "scale",
      min: 0.5,
      max: 20,
      ui: {
        label: "scale",
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
    seed: {
      type: "int",
      default: 0,
      uniform: "seed",
      min: 0,
      max: 1000,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    ridges: {
      type: "boolean",
      default: true,
      uniform: "ridges",
      ui: {
        label: "ridges",
        control: "checkbox"
      }
    },
    intensity: {
      type: "float",
      default: 1.0,
      uniform: "intensity",
      min: 0,
      max: 2,
      ui: {
        label: "intensity",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider"
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
