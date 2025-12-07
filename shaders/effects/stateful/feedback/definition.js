import { Effect } from '../../../src/runtime/effect.js'

/**
 * Feedback - Feedback post-processing effect
 *
 * Synth effect that blends the live input with a feedback buffer using
 * various blend modes. Includes transform controls (scale, rotation),
 * color controls (hue, intensity), lens effects (distortion, aberration),
 * and refraction controls.
 */
export default new Effect({
  name: "Feedback",
  namespace: "stateful",
  func: "feedback",

  description: "Feedback loop with blend modes and transforms",
  globals: {
    blendMode: {
      type: "int",
      default: 10,
      uniform: "blendMode",
      choices: {
        "add": 0,
        "cloak": 100,
        "color burn": 2,
        "color dodge": 3,
        "darken": 4,
        "difference": 5,
        "exclusion": 6,
        "glow": 7,
        "hard light": 8,
        "lighten": 9,
        "mix": 10,
        "multiply": 11,
        "negation": 12,
        "overlay": 13,
        "phoenix": 14,
        "reflect": 15,
        "screen": 16,
        "soft light": 17,
        "subtract": 18
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    mixAmt: {
      type: "float",
      default: 0,
      min: 0,
      max: 100,
      uniform: "mixAmt",
      ui: {
        label: "feedback",
        control: "slider"
      }
    },
    scaleAmt: {
      type: "float",
      default: 100,
      min: 75,
      max: 200,
      uniform: "scaleAmt",
      ui: {
        label: "scale %",
        control: "slider",
        category: "transform"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      min: -180,
      max: 180,
      uniform: "rotation",
      ui: {
        label: "rotate",
        control: "slider",
        category: "transform"
      }
    },
    refractAAmt: {
      type: "float",
      default: 0,
      min: 0,
      max: 100,
      uniform: "refractAAmt",
      ui: {
        label: "refract a→b",
        control: "slider",
        category: "refract"
      }
    },
    refractBAmt: {
      type: "float",
      default: 0,
      min: 0,
      max: 100,
      uniform: "refractBAmt",
      ui: {
        label: "refract b→a",
        control: "slider",
        category: "refract"
      }
    },
    refractADir: {
      type: "float",
      default: 0,
      min: 0,
      max: 360,
      uniform: "refractADir",
      ui: {
        label: "refract dir a",
        control: "slider",
        category: "refract"
      }
    },
    refractBDir: {
      type: "float",
      default: 0,
      min: 0,
      max: 360,
      uniform: "refractBDir",
      ui: {
        label: "refract dir b",
        control: "slider",
        category: "refract"
      }
    },
    hueRotation: {
      type: "float",
      default: 0,
      min: -180,
      max: 180,
      uniform: "hueRotation",
      ui: {
        label: "hue shift",
        control: "slider",
        category: "color"
      }
    },
    intensity: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      uniform: "intensity",
      ui: {
        label: "intensity",
        control: "slider",
        category: "color"
      }
    },
    aberrationAmt: {
      type: "float",
      default: 0,
      min: 0,
      max: 100,
      uniform: "aberrationAmt",
      ui: {
        label: "aberration",
        control: "slider",
        category: "lens"
      }
    },
    distortion: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      uniform: "distortion",
      ui: {
        label: "distortion",
        control: "slider",
        category: "lens"
      }
    }
  },
  textures: {
    _selfTex: {
      width: "input",
      height: "input",
      format: "rgba8unorm"
    }
  },
  passes: [
    {
      name: "main",
      program: "feedback",
      inputs: {
        inputTex: "inputTex",
        selfTex: "_selfTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    },
    {
      name: "feedback",
      program: "copy",
      inputs: {
        inputTex: "outputTex"
      },
      outputs: {
        fragColor: "_selfTex"
      }
    }
  ]
})
