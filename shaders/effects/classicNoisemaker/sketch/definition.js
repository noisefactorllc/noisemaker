import { Effect } from '../../../src/runtime/effect.js';

/**
 * Sketch
 * /shaders/effects/sketch/sketch.wgsl
 */
export default new Effect({
  name: "Sketch",
  namespace: "classicNoisemaker",
  func: "sketch",

  description: "Sketch/pencil effect",
  globals: {},
  passes: [
    {
      name: "main",
      program: "sketch",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        outputBuffer: "outputTex"
      }
    }
  ]
});
