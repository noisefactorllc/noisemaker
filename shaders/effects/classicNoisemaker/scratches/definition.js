import { Effect } from '../../../src/runtime/effect.js'

/**
 * Scratches
 * /shaders/effects/scratches/scratches.wgsl
 */
export default new Effect({
  name: "Scratches",
  namespace: "classicNoisemaker",
  tags: ["noise"],
  func: "scratches",

  description: "Film scratch overlay",
  globals: {
    speed: {
      type: "float",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 0,
      uniform: "seed",
      min: 0,
      max: 100,
      step: 0.1,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    enabled: {
      type: "boolean",
      default: true,
      uniform: "enabled",
      ui: {
        label: "enabled",
        control: "checkbox"
      }
    }
  },
  textures: {
    scratchMask: { width: "100%", height: "100%", format: "rgba16f" }
  },
  passes: [
    {
      name: "mask",
      program: "scratchesMask",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        speed: "speed",
        seed: "seed"
      },
      outputs: {
        fragColor: "scratchMask"
      }
    },
    {
      name: "combine",
      program: "scratches",
      inputs: {
        inputTex: "inputTex",
        maskTexture: "scratchMask"
      },
      uniforms: {
        speed: "speed",
        seed: "seed",
        enabled: "enabled"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
