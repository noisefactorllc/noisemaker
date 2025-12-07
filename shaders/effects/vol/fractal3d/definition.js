import { Effect } from '../../../src/runtime/effect.js';

/**
 * vol/fractal3d - 3D fractal volume generator
 * 
 * Generates 3D fractal volumes (Mandelbulb, Mandelcube, Julia variants).
 * Can be used standalone or chained after another 3D effect.
 * 
 * Usage:
 *   fractal3d(volumeSize: x64).render3d().write(o0)
 *   noise3d().fractal3d().render3d().write(o0)  // uses noise3d's volume size
 * 
 * If inputTex3d is provided from upstream, its dimensions take precedence
 * over volumeSize. Otherwise, allocates fresh volumeCache and geoBuffer.
 */
export default new Effect({
  name: "Fractal3D",
  namespace: "vol",
  func: "fractal3d",

  description: "3D Mandelbulb/Mandelcube fractals",
  textures: {
    volumeCache: { 
      width: { param: 'volumeSize', default: 64 }, 
      height: { param: 'volumeSize', power: 2, default: 4096 }, 
      format: "rgba16f" 
    },
    geoBuffer: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 },
      format: "rgba16f"
    }
  },
  globals: {
    "volumeSize": {
      "type": "int",
      "default": 64,
      "uniform": "volumeSize",
      "choices": {
        "x16": 16,
        "x32": 32,
        "x64": 64,
        "x128": 128
      },
      "ui": {
        "label": "volume size",
        "control": "dropdown"
      }
    },
    fractalType: {
      type: "int",
      default: 0,
      uniform: "fractalType",
      choices: {
        mandelbulb: 0,
        mandelcube: 1,
        juliaBulb: 2,
        juliaCube: 3
      },
      ui: {
        label: "type",
        control: "dropdown"
      }
    },
    power: {
      type: "float",
      default: 8,
      min: 2,
      max: 16,
      uniform: "power",
      ui: {
        label: "power",
        control: "slider"
      }
    },
    iterations: {
      type: "int",
      default: 10,
      min: 1,
      max: 20,
      uniform: "iterations",
      ui: {
        label: "iterations",
        control: "slider"
      }
    },
    bailout: {
      type: "float",
      default: 2,
      min: 1,
      max: 8,
      uniform: "bailout",
      ui: {
        label: "bailout",
        control: "slider"
      }
    },
    juliaX: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      uniform: "juliaX",
      ui: {
        label: "julia X",
        control: "slider"
      }
    },
    juliaY: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      uniform: "juliaY",
      ui: {
        label: "julia Y",
        control: "slider"
      }
    },
    juliaZ: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      uniform: "juliaZ",
      ui: {
        label: "julia Z",
        control: "slider"
      }
    },
    colorMode: {
      type: "int",
      default: 0,
      uniform: "colorMode",
      choices: {
        "mono": 0,
        orbitTrap: 1,
        "iteration": 2
      },
      ui: {
        label: "color mode",
        control: "dropdown"
      }
    },
    seed: {
      type: "float",
      default: 0,
      min: 0,
      max: 100,
      uniform: "seed"
    }
  },
  passes: [
    {
      name: "precompute",
      program: "precompute",
      drawBuffers: 2,
      viewport: { 
        width: { param: 'volumeSize', default: 64 },
        height: { param: 'volumeSize', power: 2, default: 4096 }
      },
      inputs: {},
      outputs: {
        color: "volumeCache",
        geoOut: "geoBuffer"
      }
    }
  ],
  outputTex3d: "volumeCache",
  outputGeo: "geoBuffer"
});
