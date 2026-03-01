import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "ShapeMask",
  namespace: "mixer",
  func: "shapeMask",
  tags: ["blend", "geometric"],

  description: "Composite inputs inside and outside a geometric shape",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    invert: {
      type: "int",
      default: 0,
      uniform: "invert",
      choices: {
        sourceA: 0,
        sourceB: 1
      },
      ui: {
        label: "shape source",
        control: "dropdown"
      }
    },
    shape: {
      type: "int",
      default: 0,
      uniform: "shape",
      choices: {
        circle: 0,
        triangle: 1,
        square: 2,
        pentagon: 3,
        hexagon: 4,
        flower: 5,
        ring: 6
      },
      ui: {
        label: "shape",
        control: "dropdown"
      }
    },
    radius: {
      type: "float",
      default: 0.7,
      uniform: "radius",
      min: 0,
      max: 1,
      ui: { label: "radius", control: "slider" }
    },
    edgeSmooth: {
      type: "float",
      default: 0.01,
      uniform: "edgeSmooth",
      min: 0,
      max: 0.25,
      zero: 0,
      ui: { label: "edge smooth", control: "slider" }
    },
    rotation: {
      type: "float",
      default: 0.0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: { label: "rotation", control: "slider" }
    },
    posX: {
      type: "float",
      default: 0.0,
      uniform: "posX",
      min: -1,
      max: 1,
      randChance: 0,
      ui: { label: "position x", control: "slider", category: "position" }
    },
    posY: {
      type: "float",
      default: 0.0,
      uniform: "posY",
      min: -1,
      max: 1,
      randChance: 0,
      ui: { label: "position y", control: "slider", category: "position" }
    }
  },
  passes: [
    {
      name: "render",
      program: "shapeMask",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
