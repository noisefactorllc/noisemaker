import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Atmosphere",
  namespace: "classicNoisedeck",
  func: "atmosphere",

  description: "Atmospheric fog and haze",
  uniformLayout: {
        resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    noiseType: { slot: 1, components: 'x' },
    interp: { slot: 1, components: 'y' },
    noiseScale: { slot: 1, components: 'z' },
    loopAmp: { slot: 1, components: 'w' },
    refractAmt: { slot: 2, components: 'x' },
    ridges: { slot: 2, components: 'y' },
    wrap: { slot: 2, components: 'z' },
    colorMode: { slot: 2, components: 'w' },
    hueRotation: { slot: 3, components: 'x' },
    hueRange: { slot: 3, components: 'y' },
    intensity: { slot: 3, components: 'z' },
    color1: { slot: 4, components: 'xyzw' },
    color2: { slot: 5, components: 'xyzw' },
    color3: { slot: 6, components: 'xyzw' },
    color4: { slot: 7, components: 'xyzw' }
  },
  globals: {
    noiseType: {
      type: "int",
      default: 1,
      choices: {
        caustic: 0,
        simplex: 1,
        quadTap: 2
      },
      ui: { label: "Noise Type", control: "dropdown", category: "general" },
      uniform: "noiseType"
    },
    interp: {
      type: "int",
      default: 10,
      choices: {
        linear: 0,
        linearMix: 1,
        hermite: 2,
        quadraticBSpline: 3,
        bicubicTexture: 4,
        cubicBSpline: 5,
        catmullRom: 7,
        catmullRom4x4: 8,
        simplex: 10,
        sine: 11,
        quintic: 12
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
    },
    color1: {
      type: "vec4",
      default: [1, 0, 0, 1],
      ui: { label: "Color 1", control: "color", category: "color" },
      uniform: "color1"
    },
    color2: {
      type: "vec4",
      default: [0, 1, 0, 1],
      ui: { label: "Color 2", control: "color", category: "color" },
      uniform: "color2"
    },
    color3: {
      type: "vec4",
      default: [0, 0, 1, 1],
      ui: { label: "Color 3", control: "color", category: "color" },
      uniform: "color3"
    },
    color4: {
      type: "vec4",
      default: [1, 1, 0, 1],
      ui: { label: "Color 4", control: "color", category: "color" },
      uniform: "color4"
    }
  },
  passes: [
    {
      name: "render",
      program: "atmosphere",
      inputs: {
        noiseTex: "noise"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
