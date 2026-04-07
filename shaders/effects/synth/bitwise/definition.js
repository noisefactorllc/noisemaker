import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Bitwise",
  namespace: "synth",
  func: "bitwise",
  tags: ["geometric", "pattern"],
  openCategories: ["general", "color"],

  description: "Bitwise operation patterns (XOR squares, AND, OR, etc.)",

  uniformLayout: {
    resolution: { slot: 0, components: "xy" },
    time: { slot: 0, components: "z" },
    operation: { slot: 0, components: "w" },
    scale: { slot: 1, components: "x" },
    offsetX: { slot: 1, components: "y" },
    offsetY: { slot: 1, components: "z" },
    mask: { slot: 1, components: "w" },
    seed: { slot: 2, components: "x" },
    colorMode: { slot: 2, components: "y" },
    speed: { slot: 2, components: "z" },
    rotation: { slot: 2, components: "w" },
    colorOffset: { slot: 3, components: "x" }
  },

  globals: {
    operation: {
      type: "int",
      default: 0,
      uniform: "operation",
      choices: {
        xor: 0,
        and: 1,
        or: 2,
        nand: 3,
        xnor: 4,
        mul: 5,
        add: 6,
        sub: 7
      },
      ui: {
        label: "operation",
        control: "dropdown"
      }
    },
    mask: {
      type: "int",
      default: 255,
      uniform: "mask",
      choices: {
        bit8: 255,
        bit7: 127,
        bit6: 63,
        bit5: 31,
        bit4: 15,
        bit3: 7,
        bit2: 3,
        bit1: 1
      },
      randChoices: [255, 127, 63, 31, 15],
      ui: {
        label: "bit depth",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 50,
      uniform: "scale",
      min: 1,
      max: 100,
      randMin: 25,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      zero: 0,
      ui: {
        label: "rotation",
        control: "slider"
      }
    },
    offsetX: {
      type: "int",
      default: 0,
      uniform: "offsetX",
      min: -256,
      max: 256,
      zero: 0,
      randChance: 0,
      ui: {
        label: "offset X",
        control: "slider"
      }
    },
    offsetY: {
      type: "int",
      default: 0,
      uniform: "offsetY",
      min: -256,
      max: 256,
      zero: 0,
      randChance: 0,
      ui: {
        label: "offset Y",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 0,
      uniform: "seed",
      min: 0,
      max: 255,
      zero: 0,
      ui: {
        label: "seed",
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
      randChance: 0,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    colorMode: {
      type: "int",
      default: 0,
      uniform: "colorMode",
      choices: {
        mono: 0,
        rgb: 1,
        hsv: 2
      },
      ui: {
        label: "color mode",
        control: "dropdown",
        category: "color"
      }
    },
    colorOffset: {
      type: "int",
      default: 7,
      uniform: "colorOffset",
      min: 0,
      max: 64,
      ui: {
        label: "color offset",
        control: "slider",
        category: "color",
        enabledBy: { param: "colorMode", eq: 1 }
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "bitwise",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
