import { Effect } from '../../../src/runtime/effect.js'

/**
 * Spatter
 * /shaders/effects/spatter/spatter.wgsl
 */
export default new Effect({
  name: "Spatter",
  namespace: "classicNoisemaker",
  tags: ["noise"],
  func: "spatter",

  description: "Paint spatter effect",
  globals: {
    color: {
        type: "boolean",
        default: true,
        uniform: "color",
        ui: {
            label: "color",
            control: "checkbox"
        }
    }
},
  passes: [
    {
      name: "main",
      program: "spatter",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
