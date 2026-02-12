import { Effect } from '../../../src/runtime/effect.js'

/**
 * synth/fractal - Comprehensive fractal explorer
 *
 * Supports multiple classic escape-time fractals with smooth iteration coloring,
 * flexible transform controls, animation, and multiple output modes.
 *
 * Fractal types:
 * - Mandelbrot: Classic z² + c
 * - Julia: Julia set of z² + c with animated/user-defined c
 * - Burning Ship: Absolute value variant with distinctive ship-like structures
 * - Tricorn: Complex conjugate variant (Mandelbar)
 * - Phoenix: Phoenix fractal with memory term
 * - Newton: Newton-Raphson root-finding fractal for z³ - 1
 */
export default new Effect({
  name: "Fractal",
  namespace: "synth",
  func: "fractal",
  tags: ["geometric"],

  description: "Fractal explorer with multiple types and smooth coloring",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    fractalType: { slot: 1, components: 'x' },
    power: { slot: 1, components: 'y' },
    iterations: { slot: 1, components: 'z' },
    bailout: { slot: 1, components: 'w' },
    centerX: { slot: 2, components: 'x' },
    centerY: { slot: 2, components: 'y' },
    zoom: { slot: 2, components: 'z' },
    rotation: { slot: 2, components: 'w' },
    juliaReal: { slot: 3, components: 'x' },
    juliaImag: { slot: 3, components: 'y' },
    animateJulia: { slot: 3, components: 'z' },
    speed: { slot: 3, components: 'w' },
    outputMode: { slot: 4, components: 'x' },
    colorCycles: { slot: 4, components: 'y' },
    smoothing: { slot: 4, components: 'z' },
    invert: { slot: 4, components: 'w' }
  },
  globals: {
    // === Type Selection ===
    type: {
      type: "int",
      default: 1,
      uniform: "fractalType",
      choices: {
        mandelbrot: 0,
        julia: 1,
        burningShip: 2,
        tricorn: 3,
        newton: 4
      },
      ui: {
        label: "type",
        control: "dropdown"
      }
    },
    power: {
      type: "int",
      default: 2.0,
      uniform: "power",
      min: 2,
      max: 8,
      ui: {
        label: "power",
        control: "slider",
        enabledBy: { param: "type", notIn: [4] }
      }
    },
    iterations: {
      type: "int",
      default: 100,
      uniform: "iterations",
      min: 10,
      max: 500,
      ui: {
        label: "iterations",
        control: "slider"
      }
    },
    bailout: {
      type: "float",
      default: 4.0,
      uniform: "bailout",
      min: 2,
      max: 100,
      ui: {
        label: "bailout",
        control: "slider",
        enabledBy: { param: "type", notIn: [4] }
      }
    },

    // === Transform ===
    centerX: {
      type: "float",
      default: 0.0,
      uniform: "centerX",
      min: -3,
      max: 3,
      ui: {
        label: "center x",
        control: "slider",
        category: "transform"
      }
    },
    centerY: {
      type: "float",
      default: 0,
      uniform: "centerY",
      min: -3,
      max: 3,
      ui: {
        label: "center y",
        control: "slider",
        category: "transform"
      }
    },
    zoom: {
      type: "float",
      default: 1.0,
      uniform: "zoom",
      min: 0.1,
      max: 100,
      randMax: 4,
      ui: {
        label: "zoom",
        control: "slider",
        category: "transform"
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
        category: "transform"
      }
    },

    // === Julia Parameters ===
    juliaReal: {
      type: "float",
      default: -0.7,
      uniform: "juliaReal",
      min: -2,
      max: 2,
      ui: {
        label: "julia real",
        control: "slider",
        category: "julia",
        enabledBy: {
          and: [
            { param: "type", eq: 1 },
            { param: "animateJulia", eq: false }
          ]
        }
      }
    },
    juliaImag: {
      type: "float",
      default: 0.4,
      uniform: "juliaImag",
      min: -2,
      max: 2,
      ui: {
        label: "julia imag",
        control: "slider",
        category: "julia",
        enabledBy: {
          and: [
            { param: "type", eq: 1 },
            { param: "animateJulia", eq: false }
          ]
        }
      }
    },
    animateJulia: {
      type: "boolean",
      default: false,
      uniform: "animateJulia",
      ui: {
        label: "animate c",
        control: "checkbox",
        category: "julia",
        enabledBy: { param: "type", eq: 1 }
      }
    },
    speed: {
      type: "float",
      default: 0.2,
      uniform: "speed",
      min: 0,
      max: 2,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider",
        category: "julia",
        enabledBy: { param: "animateJulia", eq: true}
      }
    },

    // === Output ===
    outputMode: {
      type: "int",
      default: 0,
      uniform: "outputMode",
      choices: {
        iterations: 0,
        distance: 1,
        angle: 2,
        potential: 3
      },
      ui: {
        label: "output mode",
        control: "dropdown",
        category: "output",
        enabledBy: { param: "type", notIn: [4] }
      }
    },
    colorCycles: {
      type: "float",
      default: 1.0,
      uniform: "colorCycles",
      min: 0.1,
      max: 10,
      ui: {
        label: "color cycles",
        control: "slider",
        category: "output"
      }
    },
    smoothing: {
      type: "float",
      default: true,
      uniform: "smoothing",
      ui: {
        label: "smooth",
        control: "checkbox",
        category: "output",
        enabledBy: { param: "type", notIn: [4] }
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
    }
  },
  paramAliases: { fractalType: 'type' },
  passes: [
    {
      name: "render",
      program: "fractal",
      inputs: {},
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
