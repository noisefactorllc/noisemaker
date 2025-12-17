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
    loopAmp: { slot: 1, components: 'z' },
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
      ui: { label: "Interpolation", control: "dropdown", category: "general" },
      uniform: "interp"
    },
    noiseScale: {
      type: "float",
      default: 85,
      min: 1,
      max: 200,
      ui: { label: "Scale", control: "slider", category: "transform" },
      uniform: "noiseScale"
    },
    loopAmp: {
      type: "float",
      default: 25,
      min: 0,
      max: 100,
      ui: { label: "Loop Amp", control: "slider", category: "animation" },
      uniform: "loopAmp"
    },
    refractAmt: {
      type: "float",
      default: 5,
      min: 0,
      max: 100,
      ui: { label: "Refract", control: "slider", category: "general" },
      uniform: "refractAmt"
    },
    ridges: {
      type: "boolean",
      default: true,
      ui: { label: "Ridges", control: "checkbox", category: "general" },
      uniform: "ridges"
    },
    wrap: {
      type: "boolean",
      default: true,
      ui: { label: "Wrap", control: "checkbox", category: "general" },
      uniform: "wrap"
    },
    seed: {
      type: "float",
      default: 44,
      min: 0,
      max: 100,
      ui: { label: "Seed", control: "slider", category: "util" },
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
      ui: { label: "Color Mode", control: "dropdown", category: "color" },
      uniform: "colorMode"
    },
    hueRotation: {
      type: "float",
      default: 180,
      min: 0,
      max: 360,
      ui: { label: "Hue Rotation", control: "slider", category: "color" },
      uniform: "hueRotation"
    },
    hueRange: {
      type: "float",
      default: 25,
      min: 0,
      max: 100,
      ui: { label: "Hue Range", control: "slider", category: "color" },
      uniform: "hueRange"
    },
    intensity: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      ui: { label: "Intensity", control: "slider", category: "color" },
      uniform: "intensity"
    }
  },
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
