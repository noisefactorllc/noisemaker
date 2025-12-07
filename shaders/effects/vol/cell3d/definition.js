import { Effect } from '../../../src/runtime/effect.js'

/**
 * vol/cell3d - 3D cellular/Voronoi noise volume generator
 *
 * Generates a 3D cell noise volume stored as a 2D atlas texture.
 * Can be used standalone or chained after another 3D effect.
 *
 * Usage:
 *   cell3d(volumeSize: x64).render3d().write(o0)
 *   noise3d().cell3d().render3d().write(o0)  // uses noise3d's volume size
 *
 * If inputTex3d is provided from upstream, its dimensions take precedence
 * over volumeSize. Otherwise, allocates fresh volumeCache and geoBuffer.
 */
export default new Effect({
  name: "Cell3D",
  namespace: "vol",
  func: "cell3d",

  description: "3D cellular/Voronoi noise volume",
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
    "metric": {
        "type": "int",
        "default": 0,
        "uniform": "metric",
        "choices": {
            "euclidean": 0,
            "manhattan": 1,
            "chebyshev": 2
        },
        "ui": {
            "label": "distance metric",
            "control": "dropdown"
        }
    },
    "scale": {
        "type": "float",
        "default": 3,
        "min": 1,
        "max": 20,
        "uniform": "scale",
        "ui": {
            "label": "cell scale"
        }
    },
    "cellVariation": {
        "type": "float",
        "default": 50,
        "min": 0,
        "max": 100,
        "uniform": "cellVariation",
        "ui": {
            "label": "cell variation"
        }
    },
    "seed": {
        "type": "float",
        "default": 1,
        "min": 0,
        "max": 100,
        "uniform": "seed"
    },
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
})
