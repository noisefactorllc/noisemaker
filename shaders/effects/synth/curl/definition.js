import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Curl",
  namespace: "synth",
  func: "curl",
  tags: ["noise", "flow"],

  description: "2D curl noise for divergence-free flow fields",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    aspectRatio: { slot: 0, components: 'w' },
    scale: { slot: 1, components: 'x' },
    seed: { slot: 1, components: 'y' },
    speed: { slot: 1, components: 'z' },
    strength: { slot: 1, components: 'w' },
    octaves: { slot: 2, components: 'x' },
    noiseType: { slot: 2, components: 'y' },
    outputMode: { slot: 2, components: 'z' }
  },
  globals: {
    noiseType: {
      type: "int",
      default: 0,
      uniform: "noiseType",
      choices: {
        perlin: 0
      },
      ui: {
        label: "noise type",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 25,
      uniform: "scale",
      min: 1,
      max: 100,
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
      max: 6,
      ui: {
        label: "octaves",
        control: "slider"
      }
    },
    seed: {
      type: "float",
      default: 0,
      uniform: "seed",
      min: 0,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0,
      max: 10,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    strength: {
      type: "float",
      default: 1.0,
      uniform: "strength",
      min: 0,
      max: 5,
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    outputMode: {
      type: "int",
      default: 3,
      uniform: "outputMode",
      choices: {
        "flow X": 0,
        "flow Y": 1,
        "direction": 2,
        "direction + magnitude": 3
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
