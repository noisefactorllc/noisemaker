// Generated from definition.json by scripts/migrate-portable-effects.mjs. Do not edit.
import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    "name": "Solid",
    "namespace": "synth",
    "func": "solid",
    "description": "Solid color fill",
    "tags": [
        "color"
    ],
    "globals": {
        "color": {
            "type": "color",
            "default": [
                0.5,
                0.5,
                0.5
            ],
            "uniform": "color",
            "ui": {
                "label": "color",
                "control": "color"
            }
        },
        "alpha": {
            "type": "float",
            "default": 1,
            "min": 0,
            "max": 1,
            "randMin": 0.5,
            "uniform": "alpha",
            "ui": {
                "label": "opacity",
                "control": "slider"
            }
        }
    },
    "passes": [
        {
            "name": "main",
            "program": "solid",
            "inputs": {},
            "outputs": {
                "color": "outputTex"
            }
        }
    ]
})
