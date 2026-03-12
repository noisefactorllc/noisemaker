import { Effect } from '../../../src/runtime/effect.js'

/**
 * synth3d/ca3d - 3D cellular automata simulation
 *
 * Generates a 3D CA volume stored as a 2D atlas texture.
 * Reads seed input from global volume surface (vol0-vol7).
 *
 * Usage:
 *   ca3d(volumeSize: x32).render3d().write(o0)
 *   ca3d(source: vol1).render3d().write(o0)  // reads seed from vol1
 */
export default new Effect({
  name: "Ca3D",
  namespace: "synth3d",
  func: "ca3d",
  tags: ["3d", "sim"],

  description: "3D cellular automata simulation",
  textures: {
    volumeCache: {
      width: { param: 'volumeSize', default: 32 },
      height: { param: 'volumeSize', power: 2, default: 1024 },
      format: "rgba16f"
    },
    geoBuffer: {
      width: { param: 'volumeSize', default: 32 },
      height: { param: 'volumeSize', power: 2, default: 1024 },
      format: "rgba16f"
    },
    // State texture for cellular automata simulation
    // Uses 'global' prefix for automatic ping-pong double-buffering by pipeline
    global_ca_state: {
      width: { param: 'volumeSize', default: 32 },
      height: { param: 'volumeSize', power: 2, default: 1024 },
      format: "rgba16f"
    }
  },
  globals: {
    "volumeSize": {
      "type": "int",
      "default": 32,
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
    "seed": {
        "type": "int",
        "default": 1,
        "min": 1,
        "max": 100,
        "uniform": "seed",
        "ui": {
            "control": false
        }
    },
    "ruleIndex": {
        "type": "int",
        "default": 0,
        "uniform": "ruleIndex",
        "choices": {
            "rule445M": 0,
            "rule678": 1,
            "amoeba": 2,
            "builder1": 3,
            "builder2": 4,
            "clouds": 5,
            "crystalGrowth": 6,
            "diamoeba": 7,
            "pyroclastic": 8,
            "slowDecay": 9,
            "spikeyGrowth": 10
        },
        "ui": {
            "label": "rules",
            "control": "dropdown",
            "category": "rules"
        }
    },
    "neighborMode": {
        "type": "int",
        "default": 0,
        "uniform": "neighborMode",
        "choices": {
            "moore": 0,
            "vonNeumann": 1
        },
        "ui": {
            "label": "neighborhood",
            "control": "dropdown",
            "category": "rules"
        }
    },
    "speed": {
        "type": "int",
        "default": 1,
        "min": 0,
        "max": 10,
        "zero": 0,
        "randMin": 1,
        "uniform": "speed",
        "ui": {
            "label": "sim speed",
            "control": "slider"
        }
    },
    "density": {
        "type": "float",
        "default": 50,
        "min": 1,
        "max": 100,
        "uniform": "density",
        "ui": {
            "label": "density",
            "control": "slider"
        }
    },
    "colorMode": {
        "type": "int",
        "default": 0,
        "uniform": "colorMode",
        "choices": {
            "mono": 0,
            "age": 1
        },
        "ui": {
            "label": "color mode",
            "control": "dropdown"
        }
    },
    "resetState": {
        "type": "boolean",
        "default": false,
        "uniform": "resetState",
        "ui": {
            "label": "reset",
            "control": "button",
            "buttonLabel": "reset"
        }
    },
    "source": {
        "type": "volume",
        "default": "vol0",
        "ui": {
            "label": "source vol",
            "category": "input"
        }
    },
    "geoSource": {
        "type": "geometry",
        "default": "geo0",
        "ui": {
            "label": "source geo",
            "category": "input"
        }
    },
    "weight": {
        "type": "float",
        "default": 0,
        "min": 0,
        "max": 100,
        "uniform": "weight",
        "ui": {
            "label": "input weight",
            "control": "slider",
            "category": "input"
        }
    },
  },
  defaultProgram: "search synth3d, filter3d, render\n\nca3d(ruleIndex: diamoeba)\n.render3d()\n.write(o0)",
  passes: [
    {
      name: "simulate",
      program: "simulate",
      viewport: {
        width: { param: 'volumeSize', default: 32 },
        height: { param: 'volumeSize', power: 2, default: 1024 }
      },
      inputs: {
        stateTex: "global_ca_state",
        seedTex: "source"
      },
      outputs: {
        color: "global_ca_state"
      }
    }
  ],
  outputTex3d: "global_ca_state",
  outputGeo: "geoBuffer"
})
