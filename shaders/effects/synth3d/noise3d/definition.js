// Generated from definition.json by scripts/migrate-portable-effects.mjs. Do not edit.
import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    "name": "Noise3D",
    "namespace": "synth3d",
    "func": "noise3d",
    "description": "3D simplex noise volume",
    "tags": [
        "3d",
        "noise"
    ],
    "globals": {
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
            "randChoices": [
                16,
                32,
                64
            ],
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
            "ui": {
                "label": "scale"
            }
        },
        "octaves": {
            "type": "int",
            "default": 1,
            "min": 1,
            "max": 6,
            "define": "OCTAVES",
            "ui": {
                "label": "octaves"
            }
        },
        "colorMode": {
            "type": "int",
            "default": 0,
            "define": "COLOR_MODE",
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
            "define": "RIDGES",
            "ui": {
                "label": "ridges"
            }
        },
        "seed": {
            "type": "int",
            "default": 0,
            "min": 0,
            "max": 100,
            "uniform": "seed",
            "ui": {
                "label": "seed"
            }
        },
        "speed": {
            "type": "int",
            "default": 1,
            "min": 0,
            "max": 5,
            "zero": 0,
            "uniform": "speed",
            "ui": {
                "label": "speed"
            }
        }
    },
    "passes": [
        {
            "name": "precompute",
            "program": "precompute",
            "drawBuffers": 2,
            "viewport": {
                "width": {
                    "param": "volumeSize",
                    "default": 64
                },
                "height": {
                    "param": "volumeSize",
                    "power": 2,
                    "default": 4096
                }
            },
            "inputs": {},
            "outputs": {
                "color": "volumeCache",
                "geoOut": "geoBuffer"
            }
        }
    ],
    "textures": {
        "volumeCache": {
            "width": {
                "param": "volumeSize",
                "default": 64
            },
            "height": {
                "param": "volumeSize",
                "power": 2,
                "default": 4096
            },
            "format": "rgba16f"
        },
        "geoBuffer": {
            "width": {
                "param": "volumeSize",
                "default": 64
            },
            "height": {
                "param": "volumeSize",
                "power": 2,
                "default": 4096
            },
            "format": "rgba16f"
        }
    },
    "outputTex3d": "volumeCache",
    "outputGeo": "geoBuffer"
})
