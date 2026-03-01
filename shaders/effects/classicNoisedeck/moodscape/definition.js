import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Moodscape",
  namespace: "classicNoisedeck",
  func: "moodscape",
  tags: ["noise"],

  description: "Refracted value noise with multiple color modes",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    interp: { slot: 1, components: 'x' },
    noiseScale: { slot: 1, components: 'y' },
    speed: { slot: 1, components: 'z' },
    refractAmt: { slot: 1, components: 'w' },
    ridges: { slot: 2, components: 'x' },
    wrap: { slot: 2, components: 'y' },
    colorMode: { slot: 2, components: 'z' },
    hueRotation: { slot: 2, components: 'w' },
    hueRange: { slot: 3, components: 'x' },
    intensity: { slot: 3, components: 'y' }
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
      ui: { label: "noise type", control: "dropdown" },
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
      zero: 0,
      ui: { label: "speed", control: "slider" },
      uniform: "speed"
    },
    refractAmt: {
      type: "float",
      default: 5,
      min: 0,
      max: 100,
      ui: { label: "refract", control: "slider" },
      uniform: "refractAmt"
    },
    ridges: {
      type: "boolean",
      default: true,
      ui: { label: "ridges", control: "checkbox" },
      uniform: "ridges"
    },
    wrap: {
      type: "boolean",
      default: true,
      ui: { label: "wrap", control: "checkbox", enabledBy: { param: "interp", lt: 10 } },
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
    colorMode: {
      type: "int",
      default: 2,
      choices: {
        "mono": 0,
        "rgb": 1,
        "hsv": 2,
        "oklab": 3
      },
      ui: { label: "color mode", control: "dropdown", category: "color" },
      uniform: "colorMode"
    },
    hueRotation: {
      type: "float",
      default: 180,
      min: 0,
      max: 360,
      ui: { label: "hue rotation", control: "slider", category: "color", enabledBy: { param: "colorMode", neq: 0 } },
      uniform: "hueRotation"
    },
    hueRange: {
      type: "float",
      default: 25,
      min: 0,
      max: 100,
      ui: { label: "hue range", control: "slider", category: "color", enabledBy: { param: "colorMode", eq: 2 } },
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
      program: "moodscape",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
