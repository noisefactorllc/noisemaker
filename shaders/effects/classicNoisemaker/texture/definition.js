import { Effect } from '../../../src/runtime/effect.js';

/**
 * Texture
 * /shaders/effects/texture/texture.wgsl
 */
export default new Effect({
  name: "Texture",
  namespace: "classicNoisemaker",
  func: "texture",
  globals: {},
  passes: [
    {
      name: "main",
      program: "texture",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
