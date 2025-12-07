import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/inv - Invert brightness
 * Simple luminance inversion: 1.0 - brightness
 */
export default new Effect({
  name: "Inv",
  namespace: "filter",
  func: "inv",

  description: "Invert image luminance",
  uniformLayout: {},
  globals: {},
  passes: [
    {
      name: "render",
      program: "inv",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
