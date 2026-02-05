import { Effect } from '../../../src/runtime/effect.js'

/**
 * Stray Hair
 * /shaders/effects/stray_hair/stray_hair.wgsl
 */
export default new Effect({
  name: "StrayHair",
  namespace: "classicNoisemaker",
  tags: ["noise"],
  func: "strayHair",

  description: "Stray hair overlay",
  globals: {
    seed: {
        type: "int",
        default: 0,
        uniform: "seed",
        min: 0,
        max: 1000,
        step: 1,
        ui: {
            label: "seed",
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
