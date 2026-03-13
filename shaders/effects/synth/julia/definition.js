import { Effect } from '../../../src/runtime/effect.js'

/**
 * synth/julia - State-of-the-art Julia set explorer
 *
 * Purpose-built for Julia set characteristics: c-value as creative control,
 * bilateral symmetry, boundary detail, morphing animation.
 * Grayscale value output — coloring handled downstream by palette pipeline.
 */
export default new Effect({
  name: "Julia",
  namespace: "synth",
  func: "julia",
  tags: ["geometric"],

  description: "Julia set explorer with deep zoom, distance estimation, and curated c-value gallery",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    cReal: { slot: 1, components: 'x' },
    cImag: { slot: 1, components: 'y' },
    poi: { slot: 1, components: 'z' },
    outputMode: { slot: 1, components: 'w' },
    centerX: { slot: 2, components: 'x' },
    centerY: { slot: 2, components: 'y' },
    rotation: { slot: 2, components: 'z' },
    iterations: { slot: 3, components: 'x' },
    stripeFreq: { slot: 3, components: 'y' },
    trapShape: { slot: 3, components: 'z' },
    lightAngle: { slot: 3, components: 'w' },
    cPath: { slot: 4, components: 'x' },
    cSpeed: { slot: 4, components: 'y' },
    cRadius: { slot: 4, components: 'z' },
    invert: { slot: 4, components: 'w' },
    zoomSpeed: { slot: 5, components: 'x' },
    zoomDepth: { slot: 5, components: 'y' }
  },
  globals: {
    // === Fractal ===
    poi: {
      type: "int",
      default: 1,
      uniform: "poi",
      choices: {
        manual: 0,
        douadyRabbit: 1,
        siegel: 2,
        dendrite: 3,
        basilica: 4,
        galaxy: 5,
        lightning: 6,
        dragonCurve: 7,
        sanMarco: 8,
        starfish: 9,
        doubleSpiral: 10
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
        normalMap: 4
      },
      ui: { label: "output mode", control: "dropdown", category: "fractal" }
    },
    iterations: {
      type: "int",
      default: 300,
      uniform: "iterations",
      min: 50,
      max: 1000,
      ui: { label: "iterations", control: "slider", category: "fractal" }
    },
    cReal: {
      type: "float",
      default: -0.123,
      uniform: "cReal",
      min: -2,
      max: 2,
      ui: {
        label: "c real",
        control: "slider",
        category: "fractal",
        enabledBy: {
          and: [
            { param: "poi", eq: 0 },
            { param: "cPath", eq: 0 }
          ]
        }
      }
    },
    cImag: {
      type: "float",
      default: 0.745,
      uniform: "cImag",
      min: -2,
      max: 2,
      ui: {
        label: "c imaginary",
        control: "slider",
        category: "fractal",
        enabledBy: {
          and: [
            { param: "poi", eq: 0 },
            { param: "cPath", eq: 0 }
          ]
        }
      }
    },

    // === Navigation ===
    centerX: {
      type: "float",
      default: 0.0,
      uniform: "centerX",
      min: -3,
      max: 3,
      ui: {
        label: "center x",
        control: "slider",
        category: "navigation"
      }
    },
    centerY: {
      type: "float",
      default: 0.0,
      uniform: "centerY",
      min: -3,
      max: 3,
      ui: {
        label: "center y",
        control: "slider",
        category: "navigation"
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
        category: "navigation"
      }
    },

    // === Animation ===
    cPath: {
      type: "int",
      default: 0,
      uniform: "cPath",
      choices: {
        none: 0,
        cardioid: 1,
        circle: 2,
        bulb: 3
      },
      ui: {
        label: "c path",
        control: "dropdown",
        category: "animation",
        enabledBy: { param: "poi", eq: 0 }
      }
    },
    cSpeed: {
      type: "float",
      default: 0.3,
      uniform: "cSpeed",
      min: 0,
      max: 2,
      zero: 0,
      ui: {
        label: "c speed",
        control: "slider",
        category: "animation",
        enabledBy: { param: "cPath", notIn: [0] }
      }
    },
    cRadius: {
      type: "float",
      default: 0.7885,
      uniform: "cRadius",
      min: 0.01,
      max: 1.5,
      ui: {
        label: "c radius",
        control: "slider",
        category: "animation",
        enabledBy: { param: "cPath", eq: 2 }
      }
    },
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
      choices: {
        point: 0,
        cross: 1,
        circle: 2
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
      default: 45.0,
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
  passes: [
    {
      name: "render",
      program: "julia",
      inputs: {},
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
