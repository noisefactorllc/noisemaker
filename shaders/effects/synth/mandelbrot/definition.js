import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Mandelbrot",
  namespace: "synth",
  func: "mandelbrot",
  tags: ["fractal"],

  description: "Mandelbrot explorer with deep zoom",

  uniformLayout: {
    resolution:  { slot: 0, components: 'xy' },
    time:        { slot: 0, components: 'z' },
    poi:         { slot: 1, components: 'x' },
    outputMode:  { slot: 1, components: 'y' },
    iterations:  { slot: 1, components: 'z' },
    centerHiX:   { slot: 2, components: 'x' },
    centerHiY:   { slot: 2, components: 'y' },
    centerLoX:   { slot: 2, components: 'z' },
    centerLoY:   { slot: 2, components: 'w' },
    zoomSpeed:   { slot: 3, components: 'x' },
    zoomDepth:   { slot: 3, components: 'y' },
    invert:      { slot: 3, components: 'z' },
    stripeFreq:  { slot: 3, components: 'w' },
    trapShape:   { slot: 4, components: 'x' },
    lightAngle:  { slot: 4, components: 'y' },
    rotation:    { slot: 4, components: 'z' },
  },

  globals: {
    // === Fractal ===
    poi: {
      type: "int",
      default: 0,
      uniform: "poi",
      choices: {
        manual: 0,
        birdOfParadise: 6,
        doubleSpiral: 8,
        elephantValley: 2,
        feigenbaum: 5,
        miniBrot: 4,
        scepterValley: 3,
        seahorseValley: 1,
        spiralGalaxy: 7
      },
      ui: { label: "preset", control: "dropdown", category: "fractal" }
    },
    outputMode: {
      type: "int",
      default: 0,
      uniform: "outputMode",
      choices: {
        distance: 1,
        normalMap: 4,
        orbitTrap: 3,
        smoothIteration: 0,
        stripeAverage: 2,
      },
      ui: { label: "output mode", control: "dropdown", category: "fractal" }
    },
    iterations: {
      type: "int",
      default: 500,
      uniform: "iterations",
      min: 50,
      max: 2000,
      ui: { label: "iterations", control: "slider", category: "fractal" }
    },
    // === Navigation (enabled when poi = manual) ===
    centerX: {
      type: "float",
      default: -0.5,
      uniform: "centerHiX",
      min: -3,
      max: 3,
      randChance: 0,
      ui: {
        label: "center x",
        control: "slider",
        category: "navigation",
        enabledBy: { param: "poi", eq: 0 }
      }
    },
    centerY: {
      type: "float",
      default: 0.0,
      uniform: "centerHiY",
      min: -3,
      max: 3,
      randChance: 0,
      ui: {
        label: "center y",
        control: "slider",
        category: "navigation",
        enabledBy: { param: "poi", eq: 0 }
      }
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
        category: "navigation",
        enabledBy: { param: "poi", eq: 0 }
      }
    },

    // === Animation ===
    zoomSpeed: {
      type: "float",
      default: 0.0,
      uniform: "zoomSpeed",
      min: 0,
      max: 5,
      step: 0.01,
      zero: 0,
      randChance: 0,
      ui: {
        label: "zoom speed",
        control: "slider",
        category: "animation"
      }
    },
    zoomDepth: {
      type: "float",
      default: 0,
      uniform: "zoomDepth",
      min: 0,
      max: 14,
      step: 0.001,
      randMax: 1,
      ui: {
        label: "zoom depth",
        control: "slider",
        category: "animation"
      }
    },

    // === Output ===
    stripeFreq: {
      type: "float",
      default: 5.0,
      uniform: "stripeFreq",
      min: 0.5,
      max: 20,
      ui: {
        label: "stripe frequency",
        control: "slider",
        category: "output",
        enabledBy: { param: "outputMode", eq: 2 }
      }
    },
    trapShape: {
      type: "int",
      default: 0,
      uniform: "trapShape",
      choices: {
        circle: 2,
        cross: 1,
        point: 0
      },
      ui: {
        label: "trap shape",
        control: "dropdown",
        category: "output",
        enabledBy: { param: "outputMode", eq: 3 }
      }
    },
    lightAngle: {
      type: "float",
      default: 45,
      uniform: "lightAngle",
      min: 0,
      max: 360,
      ui: {
        label: "light angle",
        control: "slider",
        category: "output",
        enabledBy: { param: "outputMode", eq: 4 }
      }
    },
    invert: {
      type: "boolean",
      default: false,
      uniform: "invert",
      ui: {
        label: "invert",
        control: "checkbox",
        category: "output"
      }
    },
  },

  openCategories: ["fractal", "animation"],

  paramAliases: { poiMode: 'poi' },

  passes: [
    {
      name: "render",
      program: "mandelbrot",
      inputs: {},
      outputs: { fragColor: "outputTex" }
    }
  ]
})
