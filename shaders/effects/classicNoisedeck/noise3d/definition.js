import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Noise3d",
  namespace: "classicNoisedeck",
  func: "noise3d",
  tags: ["3d", "noise"],

  description: "3D noise volumes",
  globals: {
    type: {
      type: "int",
      default: 12,
      // Compile-time define — picks one SDF variant for the raymarcher's
      // getDist() loop. Avoids ANGLE→D3D inlining 9 SDF branches into every
      // raymarch step on Windows Chrome.
      define: "NOISE_TYPE",
      choices: {
        cubes: 50,
        simplex: 12,
        sine: 30,
        spheres: 40,
        wavyPlanes: 60,
        wavyPlaneLower: 61,
        wavyPlaneUpper: 62
      },
      ui: {
        label: "noise type",
        control: "dropdown"
      }
    },
    ridges: {
      type: "boolean",
      default: false,
      uniform: "ridges",
      ui: {
        label: "ridges",
        control: "checkbox",
        enabledBy: { param: "type", eq: 12 }
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
        control: "slider",
        enabledBy: { param: "type", neq: 50 }
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: -10,
      max: 10,
      zero: 0,
      randMin: -2,
      randMax: 2,
      ui: {
        label: "speed",
        control: "slider"
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
    colorMode: {
      type: "int",
      default: 6,
      uniform: "colorMode",
      choices: {
        depthMap: 8,
        hsv: 6,
        mono: 0,
        surfaceNormal: 7
      },
      ui: {
        label: "color mode",
        control: "dropdown",
        category: "color"
      }
    },
    hueRotation: {
      type: "float",
      default: 0,
      uniform: "hueRotation",
      min: 0,
      max: 360,
      ui: {
        label: "hue rotate",
        control: "slider",
        category: "color",
        enabledBy: { param: "colorMode", eq: 6 }
      }
    },
    hueRange: {
      type: "float",
      default: 10,
      uniform: "hueRange",
      min: 0,
      max: 100,
      ui: {
        label: "hue range",
        control: "slider",
        category: "color",
        enabledBy: { param: "colorMode", eq: 6 }
      }
    }
  },
  paramAliases: { noiseScale: 'scale', noiseType: 'type' },
  passes: [
    {
      name: "render",
      program: "noise3d",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
