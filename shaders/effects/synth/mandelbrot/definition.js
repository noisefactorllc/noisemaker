import { Effect } from '../../../src/runtime/effect.js'

// Points of Interest — verified from authoritative sources
// [centerX_hi, centerX_lo, centerY_hi, centerY_lo, maxZoomLog10]
const POI_DATA = {
  seahorseValley:  [-0.7445398569107056, -3.4452e-9, 0.12172377109527588, 2.7991e-9,  14], // MROB 18-digit
  elephantValley:  [ 0.29833000898361206, -8.9836e-9, 0.0011099999537691474, 4.6231e-11, 7], // MROB
  scepterValley:   [-1.7548776865005493, 2.0254e-8, 0.0, 0.0, 14],                         // period-3 nucleus
  miniBrot:        [-1.7400623559951782, -2.6584e-8, 0.028175339102745056, 6.7647e-10, 14], // fractaljourney
  feigenbaum:      [-1.4011552333831787, 4.4291e-8, 0.0, 0.0, 14],                         // mathematical constant
  birdOfParadise:  [ 0.37500011920928955, 8.5258e-10, -0.21663938462734222, -3.8104e-9, 14], // superliminal
  spiralGalaxy:    [-0.7445389032363892, -1.6764e-8, 0.12172418087720871, -8.7721e-10, 7], // MROB
  doubleSpiral:    [-1.2553445100784302, -1.4722e-8, -0.3822004497051239, -1.3295e-8, 10], // MROB medallion
}

export default new Effect({
  name: "Mandelbrot",
  namespace: "synth",
  func: "mandelbrot",
  tags: ["geometric"],

  description: "Deep-zoom Mandelbrot explorer with multiple output algorithms and animated zoom paths",

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
      default: 1,
      uniform: "poi",
      choices: {
        manual: 0,
        seahorseValley: 1,
        elephantValley: 2,
        scepterValley: 3,
        miniBrot: 4,
        feigenbaum: 5,
        birdOfParadise: 6,
        spiralGalaxy: 7,
        doubleSpiral: 8,
      },
      ui: { label: "preset", control: "dropdown", category: "fractal" }
    },
    outputMode: {
      type: "int",
      default: 0,
      uniform: "outputMode",
      choices: {
        smoothIteration: 0,
        distance: 1,
        stripeAverage: 2,
        orbitTrap: 3,
        normalMap: 4,
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
      step: 0.1,
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
      choices: { point: 0, cross: 1, circle: 2 },
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
