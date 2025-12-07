import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/bloom - Multi-pass N-tap bloom effect
 *
 * Pass 1: Bright-pass extraction with threshold + soft knee
 * Pass 2: N-tap bloom gather using golden angle spiral kernel
 * Pass 3: Composite bloom into scene with tint and intensity
 *
 * All math in linear color space.
 */
export default new Effect({
  name: "Bloom",
  namespace: "filter",
  func: "bloom",

  description: "Multi-pass bloom with bright-pass extraction and configurable glow",
  globals: {
    threshold: {
      type: "float",
      default: 0.8,
      uniform: "bloomThreshold",
      min: 0,
      max: 2,
      step: 0.05,
      ui: {
        label: "Threshold",
        control: "slider"
      }
    },
    softKnee: {
      type: "float",
      default: 0.2,
      uniform: "bloomSoftKnee",
      min: 0,
      max: 0.5,
      step: 0.01,
      ui: {
        label: "Soft Knee",
        control: "slider"
      }
    },
    intensity: {
      type: "float",
      default: 1.0,
      uniform: "bloomIntensity",
      min: 0,
      max: 3,
      step: 0.05,
      ui: {
        label: "Intensity",
        control: "slider"
      }
    },
    radius: {
      type: "float",
      default: 32,
      uniform: "bloomRadius",
      min: 1,
      max: 128,
      step: 1,
      ui: {
        label: "Radius",
        control: "slider"
      }
    },
    taps: {
      type: "int",
      default: 8,
      uniform: "numTaps",
      min: 8,
      max: 64,
      step: 1,
      ui: {
        label: "Taps",
        control: "slider"
      }
    },
    tint: {
      type: "vec3",
      default: [1.0, 1.0, 1.0],
      uniform: "bloomTint",
      ui: {
        label: "Tint",
        control: "color"
      }
    }
  },
  textures: {
    _brightTex: {
      width: "input",
      height: "input",
      format: "rgba16float"
    },
    _bloomTex: {
      width: "input",
      height: "input",
      format: "rgba16float"
    }
  },
  passes: [
    {
      name: "brightPass",
      program: "brightPass",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "_brightTex"
      }
    },
    {
      name: "ntapGather",
      program: "ntapGather",
      inputs: {
        inputTex: "_brightTex"
      },
      outputs: {
        fragColor: "_bloomTex"
      }
    },
    {
      name: "composite",
      program: "composite",
      inputs: {
        inputTex: "inputTex",
        bloomTex: "_bloomTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
