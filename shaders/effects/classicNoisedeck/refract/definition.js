import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Refract",
  namespace: "classicNoisedeck",
  func: "refract",
  tags: ["distort", "color"],

  description: "Refraction distortion",
  globals: {
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider",
        category: "util"
      }
    },
    blendMode: {
      type: "int",
      default: 10,
      uniform: "blendMode",
      choices: {
        add: 0,
        colorBurn: 2,
        colorDodge: 3,
        darken: 4,
        difference: 5,
        exclusion: 6,
        glow: 7,
        hardLight: 8,
        lighten: 9,
        mix: 10,
        multiply: 11,
        negation: 12,
        overlay: 13,
        phoenix: 14,
        reflect: 15,
        screen: 16,
        softLight: 17,
        subtract: 18
      },
      ui: {
        label: "blend mode",
        control: "dropdown"
      }
    },
    mix: {
      type: "float",
      default: 50,
      uniform: "mixAmt",
      min: 0,
      max: 100,
      ui: {
        label: "mix",
        control: "slider"
      }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        refract: 0,
        reflect: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    amount: {
      type: "float",
      default: 50,
      uniform: "amount",
      min: 0,
      max: 100,
      ui: {
        label: "amount",
        control: "slider"
      }
    },
    direction: {
      type: "float",
      default: 0,
      uniform: "direction",
      min: 0,
      max: 360,
      ui: {
        label: "refract dir",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        clamp: 2,
        mirror: 0,
        repeat: 1
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    }
  },
  paramAliases: { refractDir: 'direction', mixAmt: 'mix' },
  passes: [
    {
      name: "render",
      program: "refract",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        mixAmt: "mix"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
