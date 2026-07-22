import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/pondRipples - Concentric ripple distortion around the fixed
 * image center. The fixed center keeps the ring geometry stable and avoids
 * duplicating the positionable-center controls provided by filter/spinBlur.
 */
export default new Effect({
  name: "Pond Ripples",
  namespace: "filter",
  func: "pondRipples",
  tags: ["distort", "artist"],

  description: "Concentric ripple distortion around the image center",
  globals: {
    amount: {
      type: "float",
      default: 30,
      uniform: "amount",
      min: 0,
      max: 100,
      zero: 0,
      ui: {
        label: "amount",
        control: "slider"
      }
    },
    ridges: {
      type: "int",
      default: 8,
      uniform: "ridges",
      min: 1,
      max: 20,
      ui: {
        label: "ridges",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 0,
      uniform: "speed",
      min: -5,
      max: 5,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    style: {
      type: "int",
      default: 2,
      define: "STYLE",
      choices: {
        aroundCenter: 0,
        outFromCenter: 1,
        pondRipples: 2
      },
      ui: {
        label: "style",
        control: "dropdown"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      define: "WRAP",
      choices: {
        mirror: 0,
        repeat: 1,
        clamp: 2
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    },
    antialias: {
      type: "boolean",
      default: true,
      uniform: "antialias",
      ui: {
        label: "antialias",
        control: "checkbox"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "pondRipples",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
