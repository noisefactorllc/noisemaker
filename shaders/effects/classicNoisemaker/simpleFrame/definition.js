import { Effect } from '../../../src/runtime/effect.js';

/**
 * Simple Frame
 * /shaders/effects/simple_frame/simple_frame.wgsl
 */
export default new Effect({
  name: "SimpleFrame",
  namespace: "classicNoisemaker",
  func: "simpleFrame",

  description: "Simple border frame",
  globals: {
    brightness: {
        type: "float",
        default: 0,
        uniform: "brightness",
        min: -1,
        max: 1,
        step: 0.01,
        ui: {
            label: "Brightness",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "simpleFrame",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        brightness: "brightness"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
