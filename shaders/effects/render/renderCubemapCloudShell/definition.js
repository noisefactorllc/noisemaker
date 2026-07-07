import { Effect } from '../../../src/runtime/effect.js'

/**
 * render/renderCubemapCloudShell - Transparent spherical cloud-shell cubemap
 *
 * Consumes an upstream 3D volume and renders it as a transparent atmospheric
 * shell, one cube face at a time, using the standard cubemap cubeBasis driver.
 */
export default new Effect({
  name: "RenderCubemapCloudShell",
  namespace: "render",
  tags: ["3d"],
  func: "renderCubemapCloudShell",

  description: "Render a transparent cloud shell into cubemap faces",
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
    "innerRadius": {
        "type": "float",
        "default": 1.0,
        "min": 0.5,
        "max": 1.5,
        "step": 0.01,
        "uniform": "innerRadius",
        "ui": {
            "label": "inner radius"
        }
    },
    "outerRadius": {
        "type": "float",
        "default": 1.1,
        "min": 0.6,
        "max": 1.8,
        "step": 0.01,
        "uniform": "outerRadius",
        "ui": {
            "label": "outer radius"
        }
    },
    "coverage": {
        "type": "float",
        "default": 0.55,
        "min": 0,
        "max": 1,
        "step": 0.01,
        "uniform": "coverage",
        "ui": {
            "label": "coverage"
        }
    },
    "softness": {
        "type": "float",
        "default": 0.18,
        "min": 0.01,
        "max": 0.5,
        "step": 0.01,
        "uniform": "softness",
        "ui": {
            "label": "softness"
        }
    },
    "density": {
        "type": "float",
        "default": 7.0,
        "min": 0,
        "max": 20,
        "step": 0.1,
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
        "step": 0.05,
        "uniform": "absorption",
        "ui": {
            "label": "absorption"
        }
    },
    "quality": {
        "type": "int",
        "default": 1,
        "define": "QUALITY",
        "choices": {
            "low": 0,
            "medium": 1,
            "high": 2
        },
        "ui": {
            "label": "quality",
            "control": "dropdown"
        }
    },
    "cloudColor": {
        "type": "color",
        "default": [0.96, 0.96, 0.9],
        "uniform": "cloudColor",
        "ui": {
            "label": "cloud color",
            "control": "color"
        }
    },
    "shadowColor": {
        "type": "color",
        "default": [0.42, 0.48, 0.58],
        "uniform": "shadowColor",
        "ui": {
            "label": "shadow color",
            "control": "color"
        }
    },
    "lightDirection": {
        "type": "vec3",
        "default": [0.45, 0.35, 0.82],
        "uniform": "lightDirection",
        "ui": {
            "label": "light dir",
            "control": "vector3"
        }
    },
    "silverLining": {
        "type": "float",
        "default": 0.25,
        "min": 0,
        "max": 1,
        "step": 0.01,
        "uniform": "silverLining",
        "ui": {
            "label": "silver lining"
        }
    },
    "cubeBasis": {
        "type": "mat3",
        "default": [1, 0, 0, 0, 1, 0, 0, 0, 1],
        "uniform": "cubeBasis",
        "ui": {
            "control": false
        }
    },
    "bgColor": {
        "type": "color",
        "default": [0.0, 0.0, 0.0],
        "uniform": "bgColor",
        "ui": {
            "label": "bg color",
            "control": "color"
        }
    },
    "bgAlpha": {
        "type": "float",
        "default": 0.0,
        "min": 0,
        "max": 1,
        "step": 0.01,
        "uniform": "bgAlpha",
        "ui": {
            "label": "bg opacity"
        }
    }
  },
  defaultProgram: "search synth3d, render\n\nnoise3d(volumeSize: x64, octaves: 4, ridges: true, colorMode: rgb)\n  .renderCubemapCloudShell()\n  .write(o0)\n\nrender(o0)",
  passes: [
    {
      name: "render",
      program: "renderCubemapCloudShell",
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
