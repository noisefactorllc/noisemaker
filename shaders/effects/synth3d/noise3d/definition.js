import { Effect } from '../../../src/runtime/effect.js'

/**
 * synth3d/noise3d - 3D simplex noise volume generator
 *
 * Generates a 3D noise volume stored as a 2D atlas texture.
 * Can be used standalone or chained after another 3D effect.
 *
 * Usage:
 *   noise3d(volumeSize: x64).render3d().write(o0)
 *   cell3d().noise3d().render3d().write(o0)  // uses cell3d's volume size
 *
 * If inputTex3d is provided from upstream, its dimensions take precedence
 * over volumeSize. Otherwise, allocates fresh volumeCache and geoBuffer.
 */
export default new Effect({
  name: "Noise3D",
  namespace: "synth3d",
  func: "noise3d",
  tags: ["3d", "noise"],

  description: "3D simplex noise volume",
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
    "scale": {
        "type": "float",
        "default": 3,
        "min": 0,
        "max": 100,
        "uniform": "scale",
        ui: {
            label: "scale"
        }},
    "octaves": {
        "type": "int",
        "default": 1,
        "min": 1,
        "max": 6,
        "uniform": "octaves",
        ui: {
            label: "octaves"
        }},
    "colorMode": {
        "type": "int",
        "default": 0,
        "uniform": "colorMode",
        "choices": {
            "mono": 0,
            "rgb": 1
        },
        "ui": {
            "label": "color mode",
            "control": "dropdown"
        }
    },
    "ridges": {
        "type": "boolean",
        "default": false,
        "uniform": "ridges",
        ui: {
            label: "ridges"
        }},
    "seed": {
        "type": "int",
        "default": 0,
        "min": 0,
        "max": 100,
        "uniform": "seed",
        ui: {
            label: "seed"
        }},
    "speed": {
        "type": "int",
        "default": 1,
        "min": 0,
        "max": 5,
        "uniform": "speed",
        ui: {
            label: "speed"
        }}
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
  outputGeo: "geoBuffer",
  outputTex3d: "volumeCache"
})
