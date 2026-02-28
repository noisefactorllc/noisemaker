import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Caustic",
  namespace: "classicNoisedeck",
  func: "caustic",
  tags: ["noise"],

  description: "Dual-noise caustic pattern with reflect blend",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    interp: { slot: 1, components: 'x' },
    noiseScale: { slot: 1, components: 'y' },
    speed: { slot: 1, components: 'z' },
    wrap: { slot: 1, components: 'w' },
    hueRotation: { slot: 2, components: 'x' },
    hueRange: { slot: 2, components: 'y' },
    intensity: { slot: 2, components: 'z' }
  },
  globals: {
    interp: {
      type: "int",
      default: 10,
      choices: {
        constant: 0,
        linear: 1,
        hermite: 2,
        catmullRom3x3: 3,
        catmullRom4x4: 4,
        bSpline3x3: 5,
        bSpline4x4: 6,
        simplex: 10,
        sine: 11
      },
      ui: { label: "noise type", control: "dropdown"},
      uniform: "interp"
    },
    noiseScale: {
      type: "float",
      default: 85,
      min: 1,
      max: 200,
      ui: { label: "scale", control: "slider" },
      uniform: "noiseScale"
    },
    speed: {
      type: "float",
      default: 25,
      min: 0,
      max: 100,
      ui: { label: "speed", control: "slider" },
      uniform: "speed"
    },
    wrap: {
      type: "boolean",
      default: true,
      ui: { label: "wrap", control: "checkbox", enabledBy: { param: "interp", notIn: [10, 11] } },
      uniform: "wrap"
    },
    seed: {
      type: "int",
      default: 44,
      min: 0,
      max: 100,
      ui: { label: "seed", control: "slider" },
      uniform: "seed"
    },
    hueRotation: {
      type: "float",
      default: 180,
      min: 0,
      max: 360,
      ui: { label: "hue rotation", control: "slider", category: "color" },
      uniform: "hueRotation"
    },
    hueRange: {
      type: "float",
      default: 25,
      min: 0,
      max: 100,
      ui: { label: "hue range", control: "slider", category: "color" },
      uniform: "hueRange"
    },
    intensity: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      ui: { label: "intensity", control: "slider", category: "color" },
      uniform: "intensity"
    }
  },
  paramAliases: { loopAmp: 'speed' },
  passes: [
    {
      name: "render",
      program: "caustic",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
