import { Effect } from '../../../src/runtime/effect.js';

/**
 * Normal Map
 * /shaders/effects/normal_map/normal_map.wgsl
 */
export default new Effect({
  name: "NormalMap",
  namespace: "classicNoisemaker",
  func: "normalMap",
  globals: {},
  passes: [
    {
      name: "main",
      program: "normalMap",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        outputBuffer: "outputTex"
      }
    }
  ]
});
