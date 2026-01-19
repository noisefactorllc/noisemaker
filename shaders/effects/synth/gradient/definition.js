import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Gradient",
  namespace: "synth",
  func: "gradient",
  tags: ["color", "util"],

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
      ui: { label: "Type", control: "dropdown", category: "general" }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "Rotation",
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
        label: "Repeat",
        control: "slider",
        category: "general",
        enabledBy: { param: "type", neq: 3 }
      }
    },
    color1: {
      type: "vec4",
      default: [1, 0, 0, 1],
      uniform: "color1",
      ui: { label: "Color 1", control: "color", category: "color" }
    },
    color2: {
      type: "vec4",
      default: [1, 1, 0, 1],
      uniform: "color2",
      ui: { label: "Color 2", control: "color", category: "color" }
    },
    color3: {
      type: "vec4",
      default: [0, 1, 0, 1],
      uniform: "color3",
      ui: { label: "Color 3", control: "color", category: "color" }
    },
    color4: {
      type: "vec4",
      default: [0, 0, 1, 1],
      uniform: "color4",
      ui: { label: "Color 4", control: "color", category: "color" }
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
