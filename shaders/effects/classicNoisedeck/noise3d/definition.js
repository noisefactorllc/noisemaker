import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Noise3d",
  namespace: "classicNoisedeck",
  func: "noise3d",
  globals: {
    noiseType: {
      type: "int",
      default: 12,
      uniform: "noiseType",
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
    noiseScale: {
      type: "float",
      default: 25,
      uniform: "noiseScale",
      min: 1,
      max: 100,
      ui: {
        label: "scale",
        control: "slider"
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
        control: "slider"
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
        control: "slider"
      }
    },
    ridges: {
      type: "boolean",
      default: false,
      uniform: "ridges",
      ui: {
        label: "ridges",
        control: "checkbox"
      }
    },
    colorMode: {
      type: "int",
      default: 6,
      uniform: "colorMode",
      choices: {
        depthMap: 8,
        mono: 0,
        hsv: 6,
        surfaceNormal: 7
      },
      ui: {
        label: "color mode",
        control: "dropdown"
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
        control: "slider"
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
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: -10,
      max: 10,
      ui: {
        label: "speed",
        control: "slider"
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
    }
  },
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
});
