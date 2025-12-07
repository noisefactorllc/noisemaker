import { Effect } from '../../../src/runtime/effect.js';

/**
 * CRT
 * /shaders/effects/crt/crt.wgsl
 */
export default new Effect({
  name: "Crt",
  namespace: "classicNoisemaker",
  func: "crt",

  description: "CRT monitor simulation",
  globals: {
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0.0,
      max: 5.0,
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
      program: "crt",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
