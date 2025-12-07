import { Effect } from '../../../src/runtime/effect.js';

/**
 * Palette
 * /shaders/effects/palette/palette.wgsl
 */
export default new Effect({
  name: "Palette",
  namespace: "classicNoisemaker",
  func: "palette",

  description: "Color palette application",
  globals: {
    paletteIndex: {
        type: "member",
        default: "palette.afterimage",
        enum: "palette",
        uniform: "paletteIndex",
        ui: {
            label: "Palette",
            control: "dropdown"
        }
    },
    alpha: {
        type: "float",
        default: 1,
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
      program: "palette",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
