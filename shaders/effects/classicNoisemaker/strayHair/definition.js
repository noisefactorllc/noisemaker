import { Effect } from '../../../src/runtime/effect.js'

/**
 * Stray Hair
 * /shaders/effects/stray_hair/stray_hair.wgsl
 */
export default new Effect({
  name: "StrayHair",
  namespace: "classicNoisemaker",
  func: "strayHair",

  description: "Stray hair overlay",
  globals: {
    seed: {
        type: "number",
        default: 0,
        uniform: "seed",
        min: 0,
        max: 1000,
        step: 1,
        ui: {
            label: "Seed",
            control: "slider"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "strayHair",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        seed: "seed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
