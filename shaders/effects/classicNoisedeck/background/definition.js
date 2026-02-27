import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Background",
  namespace: "classicNoisedeck",
  func: "background",
  tags: ["color"],

  description: "Background layer generator",
  globals: {
    type: {
      type: "int",
      default: 10,
      uniform: "backgroundType",
      choices: {
        solid: 0,
        horizontalA: 10,
        horizontalB: 11,
        verticalA: 20,
        verticalB: 21,
        radialA: 30,
        radialB: 31
      },
      ui: { label: "type", control: "dropdown"}
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: { label: "rotation", control: "slider", enabledBy: { param: "type", notIn: [0, 30, 31] } }
    },
    color1: {
      type: "color",
      default: [0, 0, 0, 1],
      uniform: "color1",
      ui: { label: "color 1", control: "color" }
    },
    color2: {
      type: "color",
      default: [1, 1, 1, 1],
      uniform: "color2",
      ui: { label: "color 2", control: "color", enabledBy: { param: "type", neq: 0 } }
    },
    alpha: {
      type: "float",
      default: 100,
      uniform: "opacity",
      min: 0,
      max: 100,
      ui: { label: "opacity", control: "slider"}
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
