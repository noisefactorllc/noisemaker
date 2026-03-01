import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Edge",
  namespace: "filter",
  func: "edge",
  tags: ["edges"],

  description: "Edge detection filter",
  globals: {
    kernel: {
      type: "int",
      default: 1,
      uniform: "kernel",
      choices: {
        fine: 0,
        bold: 1
      },
      ui: {
        label: "kernel",
        control: "dropdown"
      }
    },
    size: {
      type: "int",
      default: 0,
      uniform: "size",
      default: 1,
      choices: {
        "kernel5x5": 1,
        "kernel7x7": 2
      },
      ui: {
        label: "size",
        control: "dropdown"
      }
    },
    channel: {
      type: "int",
      default: 0,
      uniform: "channel",
      choices: {
        color: 0,
        luminance: 1
      },
      ui: {
        label: "channel",
        control: "dropdown"
      }
    },
    amount: {
      type: "float",
      default: 100,
      uniform: "amount",
      min: 0,
      max: 500,
      randMin: 100,
      ui: {
        label: "amount",
        control: "slider"
      }
    },
    invert: {
      type: "int",
      default: 0,
      uniform: "invert",
      choices: {
        off: 0,
        on: 1
      },
      ui: {
        label: "invert",
        control: "dropdown"
      }
    },
    threshold: {
      type: "float",
      default: 0,
      uniform: "threshold",
      min: 0,
      max: 100,
      ui: {
        label: "threshold",
        control: "slider"
      }
    },
    blend: {
      type: "int",
      default: 6,
      uniform: "blend",
      choices: {
        add: 0,
        darken: 1,
        difference: 2,
        dodge: 3,
        lighten: 4,
        multiply: 5,
        normal: 6,
        overlay: 7,
        screen: 8
      },
      ui: {
        label: "blend",
        control: "dropdown"
      }
    },
    mix: {
      type: "float",
      default: 100,
      uniform: "mixAmt",
      min: 0,
      max: 100,
      ui: {
        label: "mix",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "edge",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
