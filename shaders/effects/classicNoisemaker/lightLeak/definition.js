import { Effect } from '../../../src/runtime/effect.js'

/**
 * Light Leak
 * /shaders/effects/light_leak/light_leak.wgsl
 */
export default new Effect({
  name: "LightLeak",
  namespace: "classicNoisemaker",
  func: "lightLeak",

  description: "Film light leak overlay",
  globals: {
    alpha: {
        type: "float",
        default: 0.25,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "Alpha",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "lightLeak",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        outputBuffer: "outputTex"
      }
    }
  ]
})
