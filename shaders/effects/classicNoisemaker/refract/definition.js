import { Effect } from '../../../src/runtime/effect.js';

/**
 * Refract
 * /shaders/effects/refract/refract.wgsl
 */
export default new Effect({
  name: "Refract",
  namespace: "classicNoisemaker",
  func: "refract",
  globals: {
    displacement: {
      type: "float",
      default: 0.5,
      uniform: "displacement",
      min: 0,
      max: 2,
      step: 0.01,
      ui: {
        label: "Displacement",
        control: "slider"
      }
    },
    warp: {
      type: "float",
      default: 0,
      uniform: "warp",
      min: 0,
      max: 4,
      step: 0.1,
      ui: {
        label: "Warp",
        control: "slider"
      }
    },
    splineOrder: {
      type: "int",
      default: 3,
      uniform: "splineOrder",
      min: 0,
      max: 3,
      step: 1,
      ui: {
        label: "Spline Order",
        control: "slider"
      }
    },
    derivative: {
      type: "boolean",
      default: true,
      uniform: "derivative",
      ui: {
        label: "Derivative",
        control: "checkbox"
      }
    },
    range: {
      type: "float",
      default: 1,
      uniform: "range",
      min: 0.1,
      max: 4,
      step: 0.1,
      ui: {
        label: "Range",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "Speed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "refract",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        displacement: "displacement",
        warp: "warp",
        splineOrder: "splineOrder",
        derivative: "derivative",
        range: "range",
        speed: "speed"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
