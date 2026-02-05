import { Effect } from '../../../src/runtime/effect.js'

/**
 * Ripple
 * /shaders/effects/ripple/ripple.wgsl
 */
export default new Effect({
  name: "Ripple",
  namespace: "classicNoisemaker",
  tags: ["distort"],
  func: "ripple",

  description: "Ripple wave distortion",
  globals: {
    freq: {
        type: "float",
        default: 3,
        uniform: "freq",
        min: 1,
        max: 16,
        step: 0.5,
        ui: {
            label: "frequency",
            control: "slider"
        }
    },
    displacement: {
        type: "float",
        default: 0.025,
        uniform: "displacement",
        min: 0,
        max: 0.5,
        step: 0.001,
        ui: {
            label: "displacement",
            control: "slider"
        }
    },
    kink: {
        type: "float",
        default: 1,
        uniform: "kink",
        min: 0,
        max: 32,
        step: 0.5,
        ui: {
            label: "kink",
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
            label: "spline order",
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
            label: "speed",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "ripple",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        freq: "freq",
        displacement: "displacement",
        kink: "kink",
        splineOrder: "splineOrder",
        speed: "speed"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
