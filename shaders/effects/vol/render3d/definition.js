import { Effect } from '../../../src/runtime/effect.js'

/**
 * render3d - Universal 3D volume renderer
 *
 * This built-in effect extracts the common raymarching/rendering logic from all 3D effects
 * (noise3d, cell3d, shape3d, fractal3d, rd3d, ca3d, flow3d) into a reusable pipeline node.
 *
 * It takes a 3D volume (inputTex3d) and renders it to 2D (outputTex) with optional geometry
 * buffer output (geoBuffer) for downstream post-processing.
 *
 * Two rendering modes:
 * - isosurface (filtering=0): Smooth raymarching with trilinear interpolation and bisection
 * - voxel (filtering=1): DDA voxel traversal with flat face shading
 *
 * Usage in DSL:
 *   noise3d().render3d().out(o0)
 *   cell3d().render3d(threshold: 0.3, filtering: 1).out(o0)
 *
 * This effect is a DIRECT PORT of the common rendering logic - no new functionality added.
 * The goal is unification, not enhancement.
 */
export default new Effect({
  name: "Render3D",
  namespace: "vol",
  func: "render3d",

  description: "Universal 3D volume raymarcher",
  textures: {
    screenGeoBuffer: {
      width: "resolution",
      height: "resolution",
      format: "rgba16f"
    }
  },
  globals: {
    "volumeSize": {
        "type": "int",
        "default": 64,
        "uniform": "volumeSize",
        "choices": {
            "v16": 16,
            "v32": 32,
            "v64": 64,
            "v128": 128
        },
        "ui": {
            "control": false  // Always inherited from upstream volume effect
        }
    },
    "filtering": {
        "type": "int",
        "default": 0,
        "uniform": "filtering",
        "choices": {
            "isosurface": 0,
            "voxel": 1
        },
        "ui": {
            "label": "filtering",
            "control": "dropdown"
        }
    },
    "threshold": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "uniform": "threshold",
        "ui": {
            "label": "surface threshold"
        }
    },
    "invert": {
        "type": "boolean",
        "default": false,
        "uniform": "invert",
        "ui": {
            "label": "invert threshold"
        }
    },
    "orbitSpeed": {
        "type": "int",
        "default": 1,
        "min": -5,
        "max": 5,
        "uniform": "orbitSpeed",
        "ui": {
            "label": "orbit speed"
        }
    },
    "bgColor": {
        "type": "vec3",
        "default": [0.02, 0.02, 0.02],
        "uniform": "bgColor",
        "ui": {
            "label": "background color",
            "control": "color"
        }
    },
    "bgAlpha": {
        "type": "float",
        "default": 1.0,
        "min": 0,
        "max": 1,
        "uniform": "bgAlpha",
        "ui": {
            "label": "background alpha"
        }
    }
  },
  passes: [
    {
      name: "render",
      program: "render3d",
      drawBuffers: 2,
      inputs: {
        volumeCache: "inputTex3d",
        analyticalGeo: "inputGeo"
      },
      outputs: {
        color: "outputTex",
        geoOut: "screenGeoBuffer"
      }
    }
  ],
  outputGeo: "screenGeoBuffer",
  outputTex3d: "inputTex3d"
})
