import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "SacredGeometry",
    namespace: "synth",
    func: "sacredGeometry",
    tags: ["geometric", "pattern"],

    description: "Flower-of-life and related sacred-geometry lattices",
    globals: {
        "geometry": {
            "type": "int",
            "default": 0,
            "uniform": "geometry",
            "choices": {
                borromean: 6,
                flower: 0,
                fruit: 1,
                metatron: 3,
                seed: 4,
                starPolygon: 7,
                triquetra: 8,
                vesica: 5
            },
            "ui": {
                "label": "geometry",
                "control": "dropdown"
            }
        },
        "scale": {
            "type": "float",
            "default": 10.0,
            "min": 1.0,
            "max": 20.0,
            "uniform": "scale",
            "ui": {
                "label": "scale",
                "control": "slider"
            }
        },
        "rings": {
            "type": "int",
            "default": 3,
            "min": 1,
            "max": 6,
            "uniform": "rings",
            "ui": {
                "label": "rings",
                "control": "slider",
                "enabledBy": { "param": "geometry", "eq": 0 }
            }
        },
        "starPoints": {
            "type": "int",
            "default": 5,
            "min": 5,
            "max": 12,
            "uniform": "starPoints",
            "ui": {
                "label": "points",
                "control": "slider",
                "enabledBy": { "param": "geometry", "eq": 7 }
            }
        },
        "rotation": {
            "type": "float",
            "default": 0.0,
            "min": -180.0,
            "max": 180.0,
            "uniform": "rotation",
            "ui": {
                "label": "rotation",
                "control": "slider"
            }
        },
        "thickness": {
            "type": "float",
            "default": 0.2,
            "min": 0.0,
            "max": 1.0,
            "uniform": "thickness",
            "ui": {
                "label": "thickness",
                "control": "slider"
            }
        },
        "smoothness": {
            "type": "float",
            "default": 0.02,
            "min": 0.0,
            "max": 1.0,
            "uniform": "smoothness",
            "ui": {
                "label": "smoothness",
                "control": "slider"
            }
        },
        "fgColor": {
            "type": "color",
            "default": [1.0, 1.0, 1.0],
            "uniform": "fgColor",
            "ui": {
                "label": "fg color",
                "control": "color",
                "category": "color"
            }
        },
        "bgColor": {
            "type": "color",
            "default": [0.0, 0.0, 0.0],
            "uniform": "bgColor",
            "ui": {
                "label": "bg color",
                "control": "color",
                "category": "color"
            }
        },
        "animation": {
            "type": "int",
            "default": 0,
            "uniform": "animation",
            "choices": {
                none: 0,
                pulse: 2,
                ripple: 4,
                rotate: 1,
                unfold: 5
            },
            "ui": {
                "label": "animation",
                "control": "dropdown",
                "category": "animation"
            }
        },
        "speed": {
            "type": "int",
            "default": 1,
            "uniform": "speed",
            "min": -5,
            "max": 5,
            "zero": 0,
            "ui": {
                "label": "speed",
                "control": "slider",
                "category": "animation",
                "enabledBy": { "param": "animation", "neq": 0 }
            }
        },
        "pulseDepth": {
            "type": "float",
            "default": 0.15,
            "min": 0.0,
            "max": 1.0,
            "uniform": "pulseDepth",
            "ui": {
                "label": "depth",
                "control": "slider",
                "category": "animation",
                "enabledBy": { "param": "animation", "in": [2, 4] }
            }
        }
    },
    passes: [
        {
            name: "main",
            program: "sacredGeometry",
            inputs: {},
            outputs: {
                color: "outputTex"
            }
        }
    ]
})
