import { Effect } from '../../../src/runtime/effect.js';

/**
 * Shadow
 * /shaders/effects/shadow/shadow.wgsl
 */
export default new Effect({
  name: "Shadow",
  namespace: "classicNoisemaker",
  func: "shadow",
  globals: {
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
  textures: {
    shadowValueMap: { width: "100%", height: "100%", format: "rgba16f" },
    shadowSobel: { width: "100%", height: "100%", format: "rgba16f" },
    shadowSharpen: { width: "100%", height: "100%", format: "rgba16f" }
  },
  passes: [
    {
      name: "valueMap",
      program: "shadowValueMap",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "shadowValueMap"
      }
    },
    {
      name: "sobel",
      program: "shadowSobel",
      inputs: {
        valueTexture: "shadowValueMap"
      },
      outputs: {
        color: "shadowSobel"
      }
    },
    {
      name: "sharpen",
      program: "shadowSharpen",
      inputs: {
        gradientTexture: "shadowSobel"
      },
      outputs: {
        color: "shadowSharpen"
      }
    },
    {
      name: "blend",
      program: "shadowBlend",
      inputs: {
        inputTex: "inputTex",
        sobelTexture: "shadowSobel",
        sharpenTexture: "shadowSharpen"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
