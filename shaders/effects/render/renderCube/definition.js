import { Effect } from '../../../src/runtime/effect.js'

/**
 * render/renderCube - Cubemap volume renderer
 *
 * Renders a 3D volume (inputTex3d) into a 2D output using a center-camera
 * 90-degree mat3 frustum projection. Supports two compositing modes selectable
 * via cubeMode: isosurface (SDF raymarching with bisection refinement) and
 * volumetric (front-to-back emission/absorption integration, nebula look).
 *
 * Usage in DSL:
 *   noise3d().renderCube().out(o0)
 */
export default new Effect({
  name: "RenderCube",
  namespace: "render",
  tags: ["3d"],
  func: "renderCube",

  description: "Render a 3D volume into seamless cubemap faces",
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
            "control": false
        }
    },
    "mode": {
        "type": "int",
        "default": 1,
        "uniform": "cubeMode",
        "choices": {
            "isosurface": 0,
            "volumetric": 1
        },
        "ui": {
            "label": "mode",
            "control": "dropdown"
        }
    },
    "density": {
        "type": "float",
        "default": 4.0,
        "min": 0,
        "max": 20,
        "uniform": "density",
        "ui": {
            "label": "density"
        }
    },
    "absorption": {
        "type": "float",
        "default": 1.0,
        "min": 0,
        "max": 4,
        "uniform": "absorption",
        "ui": {
            "label": "absorption"
        }
    },
    "emission": {
        "type": "float",
        "default": 1.0,
        "min": 0,
        "max": 4,
        "uniform": "emission",
        "ui": {
            "label": "emission"
        }
    },
    "threshold": {
        "type": "float",
        "default": 0.5,
        "min": 0,
        "max": 1,
        "randMax": 0.3,
        "uniform": "threshold",
        "ui": {
            "label": "threshold"
        }
    },
    "invert": {
        "type": "boolean",
        "default": false,
        "randChance": 0,
        "define": "INVERT",
        "ui": {
            "label": "invert thresh"
        }
    },
    "cubeBasis": {
        "type": "mat3",
        "default": [1,0,0, 0,1,0, 0,0,1],
        "uniform": "cubeBasis",
        "ui": {
            "control": false
        }
    },
    "bgColor": {
        "type": "color",
        "default": [0.02, 0.02, 0.02],
        "uniform": "bgColor",
        "ui": {
            "label": "bg color",
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
            "label": "bg opacity"
        }
    }
  },
  passes: [
    {
      name: "render",
      program: "renderCube",
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
