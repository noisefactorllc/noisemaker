import { Effect } from '../../../src/runtime/effect.js';

/**
 * On-Screen Display
 * /shaders/effects/on_screen_display/on_screen_display.wgsl
 */
export default new Effect({
  name: "OnScreenDisplay",
  namespace: "classicNoisemaker",
  func: "onScreenDisplay",

  description: "On-screen display overlay",
  globals: {},
  passes: [
    {
      name: "main",
      program: "onScreenDisplay",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
