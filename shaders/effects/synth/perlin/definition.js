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
        // Compile-time define — picks 2D vs 3D noise implementation. Each
        // produces its own compiled program. Avoids ANGLE→D3D inlining both
        // fbm2D + fbm3D + domainWarp2D + domainWarp3D into main(), which was
        // producing a 1.3s compile via filter/adjust on Windows Chrome.
        // The uniform field is preserved on the wgsl side for layout
        // compatibility but is no longer read by the shader.
        "uniform": "dimensions",
        "define": "DIMENSIONS",
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
        "randMax": 2,
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
