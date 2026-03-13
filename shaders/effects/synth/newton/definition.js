import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Newton",
  namespace: "synth",
  func: "newton",
  tags: ["fractal"],

  description: "Newton fractal explorer with deep zoom",

  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time:       { slot: 0, components: 'z' },
    degree:     { slot: 0, components: 'w' },
    relaxation: { slot: 1, components: 'x' },
    iterations: { slot: 1, components: 'y' },
    tolerance:  { slot: 1, components: 'z' },
    poi:        { slot: 1, components: 'w' },
    centerHiX:  { slot: 2, components: 'x' },
    centerHiY:  { slot: 2, components: 'y' },
    centerLoX:  { slot: 2, components: 'z' },
    centerLoY:  { slot: 2, components: 'w' },
    zoomSpeed:  { slot: 3, components: 'x' },
    zoomDepth:  { slot: 3, components: 'y' },
    degreeSpeed:{ slot: 3, components: 'z' },
    degreeRange:{ slot: 3, components: 'w' },
    relaxSpeed: { slot: 4, components: 'x' },
    relaxRange: { slot: 4, components: 'y' },
    outputMode: { slot: 4, components: 'z' },
    invert:     { slot: 4, components: 'w' }
  },

  globals: {
    // === Fractal ===
    poi: {
      type: "int",
      default: 5,
      uniform: "poi",
      choices: {
        manual: 0,
        hexWeb6: 5,
        octoFlower8: 6,
        pentaSpiral5: 4,
        spiralJunction3: 2,
        starCenter5: 3,
        triplePoint3: 1
      },
      ui: { label: "preset", control: "dropdown", category: "fractal" }
    },
    outputMode: {
      type: "int",
      default: 2,
      uniform: "outputMode",
      choices: {
        blended: 2,
        iteration: 0,
        rootIndex: 1
      },
      ui: { label: "output mode", control: "dropdown", category: "fractal" }
    },
    iterations: {
      type: "int",
      default: 100,
      min: 10,
      max: 500,
      uniform: "iterations",
      ui: { label: "iterations", control: "slider", category: "fractal" }
    },
    degree: {
      type: "int",
      default: 3,
      min: 3,
      max: 8,
      uniform: "degree",
      ui: { label: "degree", control: "slider", category: "fractal", enabledBy: { param: "poi", eq: 0 } }
    },
    relaxation: {
      type: "float",
      default: 1.0,
      min: 0.5,
      max: 2.0,
      step: 0.01,
      uniform: "relaxation",
      ui: { label: "relaxation", control: "slider", category: "fractal" }
    },
    tolerance: {
      type: "float",
      default: 0.001,
      min: 0.0001,
      max: 0.01,
      step: 0.0001,
      uniform: "tolerance",
      ui: { label: "tolerance", control: "slider", category: "fractal" }
    },

    // === Navigation ===
    centerX: {
      type: "float",
      default: 0.0,
      min: -3,
      max: 3,
      randChance: 0,
      uniform: "centerHiX",
      ui: { label: "center x", control: "slider", category: "navigation", enabledBy: { param: "poi", eq: 0 } }
    },
    centerY: {
      type: "float",
      default: 0.0,
      min: -3,
      max: 3,
      randChance: 0,
      uniform: "centerHiY",
      ui: { label: "center y", control: "slider", category: "navigation", enabledBy: { param: "poi", eq: 0 } }
    },

    // === Animation ===
    zoomSpeed: {
      type: "float",
      default: 0.0,
      min: 0,
      max: 5,
      step: 0.01,
      zero: 0,
      randChance: 0,
      uniform: "zoomSpeed",
      ui: { label: "zoom speed", control: "slider", category: "animation" }
    },
    zoomDepth: {
      type: "float",
      default: 0,
      min: 0,
      max: 14,
      step: 0.1,
      randMax: 1,
      uniform: "zoomDepth",
      ui: { label: "zoom depth", control: "slider", category: "animation" }
    },
    degreeSpeed: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      randChance: 0,
      uniform: "degreeSpeed",
      ui: { label: "degree speed", control: "slider", category: "animation", enabledBy: { param: "poi", eq: 0 } }
    },
    degreeRange: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 3.0,
      step: 0.01,
      randChance: 0,
      uniform: "degreeRange",
      ui: { label: "degree range", control: "slider", category: "animation", enabledBy: { param: "poi", eq: 0 } }
    },
    relaxSpeed: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      randChance: 0,
      uniform: "relaxSpeed",
      ui: { label: "relax speed", control: "slider", category: "animation" }
    },
    relaxRange: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 0.5,
      step: 0.01,
      randChance: 0,
      uniform: "relaxRange",
      ui: { label: "relax range", control: "slider", category: "animation" }
    },

    // === Output ===
    invert: {
      type: "boolean",
      default: false,
      uniform: "invert",
      ui: { label: "invert", control: "checkbox", category: "output" }
    }
  },

  openCategories: ["fractal", "animation"],

  passes: [
    {
      name: "render",
      program: "newton",
      inputs: {},
      outputs: { fragColor: "outputTex" }
    }
  ]
})
