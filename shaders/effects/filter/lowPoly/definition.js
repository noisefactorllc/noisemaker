import { Effect } from '../../../src/runtime/effect.js'

/**
 * Low Poly - Voronoi-based low-polygon art style
 * Generates seed points, finds nearest for each pixel, fills cells with input color.
 * borderWidth adds edgeColor along Voronoi boundaries; lightIntensity raises
 * the selected mode's cell shading without illuminating those borders.
 */
export default new Effect({
  name: "Low Poly",
  namespace: "filter",
  func: "lowPoly",
  tags: ["geometric", "noise"],

  description: "Low-polygon style render using Voronoi cells",
  globals: {
    scale: {
      type: "int",
      default: 50,
      uniform: "scale",
      min: 2,
      max: 100,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    mode: {
      type: "int",
      default: 1,
      uniform: "mode",
      choices: {
        flat: 0,
        edges: 1,
        distance2: 2,
        distance3: 3
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    edgeStrength: {
      type: "float",
      default: 0.15,
      uniform: "edgeStrength",
      min: 0.0,
      max: 1.0,
      ui: {
        label: "strength",
        control: "slider",
        enabledBy: { param: "mode", neq: 0 }
      }
    },
    edgeColor: {
      type: "color",
      default: [0.0, 0.0, 0.0],
      uniform: "edgeColor",
      ui: {
        label: "edge color",
        control: "color",
        enabledBy: {
          or: [
            { param: "borderWidth", gt: 0 },
            { param: "mode", eq: 1 }
          ]
        }
      }
    },
    borderWidth: {
      type: "int",
      default: 0,
      uniform: "borderWidth",
      define: "LP_BORDER",
      min: 0,
      max: 100,
      zero: 0,
      ui: {
        label: "border width",
        control: "slider"
      }
    },
    lightIntensity: {
      type: "int",
      default: 0,
      uniform: "lightIntensity",
      define: "LP_LIGHT",
      min: 0,
      max: 100,
      zero: 0,
      ui: {
        label: "light intensity",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 1.0,
      uniform: "alpha",
      min: 0.0,
      max: 1.0,
      randChance: 0,
      ui: {
        label: "alpha",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 0,
      uniform: "speed",
      min: 0,
      max: 5,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider"
      }
    }
  },
  paramAliases: { freq: 'scale', nth: 'mode' },
  passes: [
    {
      name: "render",
      program: "lowPoly",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
