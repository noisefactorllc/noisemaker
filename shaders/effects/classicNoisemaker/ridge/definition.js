import { Effect } from '../../../src/runtime/effect.js';

/**
 * Ridge
 * /shaders/effects/ridge/ridge.wgsl
 */
export default new Effect({
  name: "Ridge",
  namespace: "classicNoisemaker",
  func: "ridge",
  globals: {},
  passes: [
    {
      name: "main",
      program: "ridge",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        outputBuffer: "outputTex"
      }
    }
  ]
});
