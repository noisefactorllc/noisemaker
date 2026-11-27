// Generated from definition.json by scripts/migrate-portable-effects.mjs. Do not edit.
import { Effect } from '../../../src/runtime/effect.js'
import { composeCatalogCapabilities } from '../../../src/portable/instantiate.js'
import '../../../src/portable/providers/index.js'

const capabilities = composeCatalogCapabilities({
    "name": "Fibers",
    "namespace": "filter",
    "func": "fibers",
    "description": "Chaotic fiber texture overlay",
    "tags": [
        "noise"
    ],
    "globals": {
        "density": {
            "type": "float",
            "default": 0.5,
            "uniform": "density",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "ui": {
                "label": "density",
                "control": "slider"
            }
        },
        "seed": {
            "type": "int",
            "default": 1,
            "uniform": "seed",
            "min": 1,
            "max": 100,
            "step": 1,
            "ui": {
                "label": "seed",
                "control": "slider"
            }
        },
        "alpha": {
            "type": "float",
            "default": 0.5,
            "uniform": "alpha",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "ui": {
                "label": "alpha",
                "control": "slider"
            }
        }
    },
    "passes": [
        {
            "name": "blend",
            "program": "fibersBlend",
            "inputs": {
                "inputTex": "inputTex",
                "overlayTex": "overlayTex"
            },
            "uniforms": {
                "alpha": "alpha"
            },
            "outputs": {
                "fragColor": "outputTex"
            }
        }
    ],
    "textures": {
        "overlayTex": {
            "width": "screen",
            "height": "screen",
            "format": "rgba8"
        }
    },
    "defaultProgram": "search filter, synth\n\nsolid(color: #000000)\n.fibers(density: 1)\n.write(o0)",
    "capabilities": [
        {
            "id": "noisemaker/worm-overlay",
            "version": 1,
            "options": {
                "recipe": {
                    "layers": 4,
                    "checkEachLayer": true,
                    "layerSeed": {
                        "multiply": 1000,
                        "step": 137,
                        "offset": 0
                    },
                    "densityDefault": 0.5,
                    "density": {
                        "base": 0.5,
                        "scale": 2
                    },
                    "kink": {
                        "base": 5,
                        "modulus": 5
                    },
                    "stride": 0.75,
                    "strideDeviation": 0.125,
                    "duration": {
                        "base": 1
                    },
                    "behavior": {
                        "name": "chaotic"
                    },
                    "flowFreq": {
                        "base": 4
                    },
                    "lineWidth": {
                        "minimum": 1.5,
                        "divide": 384
                    },
                    "color": {
                        "random": {
                            "scale": 200,
                            "offset": 55
                        },
                        "alpha": 0.5
                    }
                }
            },
            "bindings": {
                "parameters": {
                    "seed": "seed",
                    "density": "density"
                },
                "textures": {
                    "overlay": "overlayTex"
                }
            }
        }
    ]
})

class Fibers extends Effect {
    constructor() {
        super()
        Object.assign(this, structuredClone(capabilities.fields))
        capabilities.attach(this)
    }

    asyncInit(...args) {
        return capabilities.hooks.asyncInit.apply(this, args)
    }
}

export default new Fibers()
