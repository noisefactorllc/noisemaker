import { Effect } from '../../../src/runtime/effect.js'

/**
 * synth3d/rd3d - 3D reaction-diffusion simulation
 *
 * Generates a 3D reaction-diffusion volume stored as a 2D atlas texture.
 * Reads seed input from global volume surface (vol0-vol7).
 *
 * Usage:
 *   rd3d(volumeSize: x32).render3d().write(o0)
 *   rd3d(source: vol1).render3d().write(o0)  // reads seed from vol1
 */
export default new Effect({
  name: "Rd3D",
  namespace: "synth3d",
  func: "rd3d",
  tags: ["3d", "sim"],

  description: "3D reaction-diffusion simulation",
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
    // State texture for reaction-diffusion simulation
    // Uses 'global' prefix for automatic ping-pong double-buffering by pipeline
    global_rd_state: {
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
        "min": 0,
        "max": 100,
        "uniform": "seed",
        "ui": {
            "control": false
        }
    },
    "iterations": {
      "type": "int",
      "default": 8,
      "uniform": "iterations",
      "min": 1,
      "max": 32,
      "ui": {
        "label": "iterations",
        "control": "slider"
      }
    },
    "feed": {
      "type": "float",
      "default": 55,
      "uniform": "feed",
      "min": 10,
      "max": 110,
      "ui": {
        "label": "feed rate",
        "control": "slider",
        "category": "rules"
      }
    },
    "kill": {
      "type": "float",
      "default": 62,
      "uniform": "kill",
      "min": 45,
      "max": 70,
      "ui": {
        "label": "kill rate",
        "control": "slider",
        "category": "rules"
      }
    },
    "rate1": {
      "type": "float",
      "default": 100,
      "uniform": "rate1",
      "min": 50,
      "max": 120,
      "ui": {
        "label": "diffuse rate A",
        "control": "slider",
        "category": "rules"
      }
    },
    "rate2": {
      "type": "float",
      "default": 50,
      "uniform": "rate2",
      "min": 20,
      "max": 80,
      "ui": {
        "label": "diffuse rate B",
        "control": "slider",
        "category": "rules"
      }
    },
    "speed": {
      "type": "float",
      "default": 100,
      "uniform": "speed",
      "min": 10,
      "max": 200,
      "ui": {
        "label": "sim speed",
        "control": "slider"
      }
    },
    "colorMode": {
        "type": "int",
        "default": 0,
        "uniform": "colorMode",
        "choices": {
            "mono": 0,
            "gradient": 1
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
        "label": "state",
        "control": "button",
        "buttonLabel": "reset"
      }
    },
    "source": {
        "type": "volume",
        "default": "vol0",
        "ui": {
            "label": "source volume",
            "category": "input"
        }
    },
    "geoSource": {
        "type": "geometry",
        "default": "geo0",
        "ui": {
            "label": "source geometry",
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
    }
  },
  passes: [
    {
      name: "simulate",
      program: "simulate",
      repeat: "iterations",
      viewport: {
        width: { param: 'volumeSize', default: 32 },
        height: { param: 'volumeSize', power: 2, default: 1024 }
      },
      inputs: {
        stateTex: "global_rd_state",
        seedTex: "source"
      },
      outputs: {
        color: "global_rd_state"
      }
    }
  ],
  outputTex3d: "global_rd_state",
  outputGeo: "geoBuffer"
})
