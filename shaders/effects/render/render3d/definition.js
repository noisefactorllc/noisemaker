// Generated from definition.json by scripts/migrate-portable-effects.mjs. Do not edit.
import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    "name": "Render3D",
    "namespace": "render",
    "func": "render3d",
    "description": "Universal 3D volume raymarcher",
    "tags": [
        "3d"
    ],
    "globals": {
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
        "filtering": {
            "type": "int",
            "default": 0,
            "define": "FILTERING",
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
        "orbitSpeed": {
            "type": "int",
            "default": 1,
            "min": -5,
            "max": 5,
            "randMin": -1,
            "randMax": 1,
            "uniform": "orbitSpeed",
            "ui": {
                "label": "orbit speed"
            }
        },
        "bgColor": {
            "type": "color",
            "default": [
                0.02,
                0.02,
                0.02
            ],
            "uniform": "bgColor",
            "ui": {
                "label": "bg color",
                "control": "color"
            }
        },
        "bgAlpha": {
            "type": "float",
            "default": 1,
            "min": 0,
            "max": 1,
            "uniform": "bgAlpha",
            "ui": {
                "label": "bg opacity"
            }
        }
    },
    "passes": [
        {
            "name": "render",
            "program": "render3d",
            "drawBuffers": 2,
            "inputs": {
                "volumeCache": "inputTex3d"
            },
            "outputs": {
                "color": "outputTex",
                "geoOut": "screenGeoBuffer"
            }
        }
    ],
    "textures": {
        "screenGeoBuffer": {
            "width": "resolution",
            "height": "resolution",
            "format": "rgba16f"
        }
    },
    "outputTex3d": "inputTex3d",
    "outputGeo": "screenGeoBuffer"
})
