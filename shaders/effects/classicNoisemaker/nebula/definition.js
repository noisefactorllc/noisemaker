import { Effect } from '../../../src/runtime/effect.js';

/**
 * Nebula
 * /shaders/effects/nebula/nebula.wgsl
 */
export default new Effect({
  name: "Nebula",
  namespace: "classicNoisemaker",
  func: "nebula",

  description: "Nebula/space cloud generator",
  globals: {},
  passes: [
    {
      name: "main",
      program: "nebula",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        outputBuffer: "outputTex"
      }
    }
  ]
});
