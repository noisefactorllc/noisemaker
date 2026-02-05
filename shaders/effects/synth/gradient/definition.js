import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Gradient",
  namespace: "synth",
  func: "gradient",
  tags: ["color"],

  description: "Multi-color gradient generator with various styles",
  globals: {
    type: {
      type: "int",
      default: 3,
      uniform: "gradientType",
      choices: {
        linear: 0,
        radial: 1,
        conic: 2,
        fourCorners: 3
      },
      ui: { label: "type", control: "dropdown", category: "general" }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "rotation",
        control: "slider",
        category: "general",
        enabledBy: { param: "type", neq: 1 }
      }
    },
    repeat: {
      type: "int",
      default: 1,
      uniform: "repeatCount",
      min: 1,
      max: 4,
      ui: {
        label: "repeat",
        control: "slider",
        category: "general",
        enabledBy: { param: "type", neq: 3 }
      }
    },
    color1: {
      type: "color",
      default: [1, 0, 0],
      uniform: "color1",
      ui: { label: "color 1", control: "color", category: "color" }
    },
    color2: {
      type: "color",
      default: [1, 1, 0],
      uniform: "color2",
      ui: { label: "color 2", control: "color", category: "color" }
    },
    color3: {
      type: "color",
      default: [0, 1, 0],
      uniform: "color3",
      ui: { label: "color 3", control: "color", category: "color" }
    },
    color4: {
      type: "color",
      default: [0, 0, 1],
      uniform: "color4",
      ui: { label: "color 4", control: "color", category: "color" }
    }
  },
  passes: [
    {
      name: "main",
      program: "gradient",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
