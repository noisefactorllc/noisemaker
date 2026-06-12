import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "Mandala",
    namespace: "synth",
    func: "mandala",
    tags: ["geometric", "pattern"],
    openCategories: ["general", "layers"],

    description: "N-fold symmetric mandala generator",
    globals: {
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
        "symmetry": {
            "type": "int",
            "default": 12,
            "min": 3,
            "max": 24,
            "uniform": "symmetry",
            "ui": {
                "label": "symmetry",
                "control": "slider"
            }
        },
        "bindu": {
            "type": "boolean",
            "default": false,
            "uniform": "bindu",
            "ui": {
                "label": "center dot",
                "control": "checkbox"
            }
        },
        "shape": {
            "type": "int",
            "default": 0,
            "uniform": "shape",
            "choices": {
                dot: 2,
                petal: 0,
                triangle: 1
            },
            "ui": {
                "label": "shape",
                "control": "dropdown",
                "category": "layers"
            }
        },
        "layers": {
            "type": "int",
            "default": 6,
            "min": 1,
            "max": 12,
            "uniform": "layers",
            "ui": {
                "label": "layers",
                "control": "slider",
                "category": "layers"
            }
        },
        "layerSpacing": {
            "type": "float",
            "default": 1.5,
            "min": 0.5,
            "max": 3.0,
            "uniform": "layerSpacing",
            "ui": {
                "label": "spacing",
                "control": "slider",
                "category": "layers"
            }
        },
        "twist": {
            "type": "float",
            "default": 0.0,
            "min": -45.0,
            "max": 45.0,
            "uniform": "twist",
            "ui": {
                "label": "twist",
                "control": "slider",
                "category": "layers"
            }
        },
        "shapeGrowth": {
            "type": "float",
            "default": 0.0,
            "min": -1.0,
            "max": 1.0,
            "uniform": "shapeGrowth",
            "ui": {
                "label": "growth",
                "control": "slider",
                "category": "layers"
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
                counterRotate: 4,
                differential: 3,
                pulse: 2,
                ripple: 6,
                rotate: 1,
                spiralWave: 5
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
                "enabledBy": { "param": "animation", "in": [2, 6] }
            }
        }
    },
    passes: [
        {
            name: "main",
            program: "mandala",
            inputs: {},
            outputs: {
                color: "outputTex"
            }
        }
    ]
})
