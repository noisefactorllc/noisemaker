import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Background",
  namespace: "classicNoisedeck",
  func: "background",
  tags: ["geometric"],

  description: "Background layer generator",
  globals: {
    type: {
      type: "int",
      default: 10,
      uniform: "backgroundType",
      choices: {
        solid: 0,
        horizontal12: 10,
        horizontal21: 11,
        vertical12: 20,
        vertical21: 21,
        radial12: 30,
        radial21: 31
      },
      ui: { label: "type", control: "dropdown", category: "general" }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: { label: "rotation", control: "slider", category: "general" }
    },
    alpha: {
      type: "float",
      default: 100,
      uniform: "opacity",
      min: 0,
      max: 100,
      ui: { label: "opacity", control: "slider", category: "general" }
    },
    color1: {
      type: "color",
      default: [0, 0, 0, 1],
      uniform: "color1",
      ui: { label: "color 1", control: "color", category: "color" }
    },
    color2: {
      type: "color",
      default: [1, 1, 1, 1],
      uniform: "color2",
      ui: { label: "color 2", control: "color", category: "color" }
    }
  },
  paramAliases: { backgroundType: 'type', opacity: 'alpha' },
  passes: [
    {
      name: "render",
      program: "background",
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
