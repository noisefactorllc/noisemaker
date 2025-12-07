import { Effect } from '../../../src/runtime/effect.js';

/**
 * Frame
 * Vintage film frame effect with vignette, grime, scratches, grain
 */
export default new Effect({
  name: "Frame",
  namespace: "classicNoisemaker",
  func: "frame",
  globals: {
    speed: {
      type: "float",
      default: 1.0,
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
      program: "frame",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
