import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Perlin",
  namespace: "synth",
  func: "perlin",
  tags: ["noise"],

  description: "Perlin-like noise with optional warping",
  globals: {
    "scale": {
        "type": "float",
        "default": 25,
        "min": 0,
        "max": 100,
        "randMin": 15,
        "uniform": "scale",
        ui: {
            label: "scale"
        }},
    "octaves": {
        "type": "int",
        "default": 1,
        "min": 1,
        "max": 6,
        "uniform": "octaves",
        ui: {
            label: "octaves"
        }},
    "colorMode": {
        "type": "int",
        "default": 1,
        "uniform": "colorMode",
        "choices": {
            "mono": 0,
            "rgb": 1
        },
        "ui": {
            "label": "color mode",
            "control": "dropdown"
        }
    },
    "dimensions": {
        "type": "int",
        "default": 2,
        "min": 2,
        "max": 3,
        "uniform": "dimensions",
        ui: {
            label: "dimensions"
        }},
    "ridges": {
        "type": "boolean",
        "default": false,
        "uniform": "ridges",
        ui: {
            label: "ridges"
        }},
    "warpIterations": {
        "type": "int",
        "default": 0,
        "min": 0,
        "max": 4,
        "uniform": "warpIterations",
        ui: {
            label: "warp iterations",
            category: "warp"
        }},
    "warpScale": {
        "type": "float",
        "default": 50,
        "min": 0,
        "max": 100,
        "uniform": "warpScale",
        ui: {
            label: "warp scale",
            category: "warp",
            enabledBy: { param: "warpIterations", neq: 0 }
        }},
    "warpIntensity": {
        "type": "float",
        "default": 50,
        "min": 0,
        "max": 100,
        "uniform": "warpIntensity",
        ui: {
            label: "warp intensity",
            category: "warp",
            enabledBy: { param: "warpIterations", neq: 0 }
        }},
    "seed": {
        "type": "int",
        "default": 0,
        "min": 0,
        "max": 100,
        "uniform": "seed",
        ui: {
            label: "seed"
        }},
    "speed": {
        "type": "int",
        "default": 1,
        "min": 0,
        "max": 5,
        "zero": 0,
        "uniform": "speed",
        ui: {
            label: "speed"
        }}
  },
  passes: [
    {
      name: "main",
      program: "perlin",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
