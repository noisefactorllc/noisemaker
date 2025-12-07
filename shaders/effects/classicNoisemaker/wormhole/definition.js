import { Effect } from '../../../src/runtime/effect.js';

/**
 * Wormhole - per-pixel field flow driven by luminance
 */
export default new Effect({
  name: "Wormhole",
  namespace: "classicNoisemaker",
  func: "wormhole",
  globals: {
    kink: {
      type: "float",
      default: 1,
      uniform: "kink",
      min: 0,
      max: 10,
      step: 0.1,
      ui: {
        label: "Kink",
        control: "slider"
      }
    },
    stride: {
      type: "float",
      default: 0.5,
      uniform: "stride",
      min: 0,
      max: 5,
      step: 0.01,
      ui: {
        label: "Stride",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 0.5,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Alpha",
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
      program: "wormhole",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        kink: "kink",
        stride: "stride",
        alpha: "alpha",
        speed: "speed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
