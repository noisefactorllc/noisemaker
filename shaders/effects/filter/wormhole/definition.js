import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/wormhole - Luminance-driven scatter displacement
 * Multi-pass scatter implementation matching Python scatter_nd wormhole
 */
export default new Effect({
  name: "Wormhole",
  namespace: "filter",
  func: "wormhole",
  tags: ["distort"],

  description: "Luminance-driven scatter displacement field",

  textures: {
    wormhole_accum: {
      width: "100%",
      height: "100%",
      format: "rgba16f"
    }
  },

  globals: {
    kink: {
      type: "float",
      default: 1,
      uniform: "kink",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "kink",
        control: "slider"
      }
    },
    stride: {
      type: "float",
      default: 1,
      uniform: "stride",
      min: 0,
      max: 2,
      step: 0.01,
      ui: {
        label: "stride",
        control: "slider"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      step: 1,
      ui: {
        label: "rotation",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 1,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1,
        clamp: 2
      },
      randChance: 0,
      ui: {
        label: "wrap",
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
        label: "alpha",
        control: "slider"
      }
    },
  },

  passes: [
    // Pass 1: Clear accumulation buffer
    {
      name: "clear",
      program: "clear",
      inputs: {},
      outputs: {
        fragColor: "wormhole_accum"
      }
    },

    // Pass 2: Scatter deposit - each pixel scatters to destination based on luminance
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 'input',
      blend: true,

      inputs: {
        inputTex: "inputTex"
      },

      uniforms: {
        kink: "kink",
        stride: "stride",
        rotation: "rotation",
        wrap: "wrap"
      },

      outputs: {
        fragColor: "wormhole_accum"
      }
    },

    // Pass 3: Normalize, sqrt, blend with original
    {
      name: "blend",
      program: "blend",

      inputs: {
        inputTex: "inputTex",
        accumTex: "wormhole_accum"
      },

      uniforms: {
        alpha: "alpha"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
