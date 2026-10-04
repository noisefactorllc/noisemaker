import { Effect } from '../../../src/runtime/effect.js'

/**
 * Degauss
 * CRT degauss effect
 */
export default new Effect({
  name: "Degauss",
  namespace: "filter",
  func: "degauss",
  tags: ["distort"],

  description: "CRT degauss effect",

  // WGSL uniform packing layout - maps uniform names to vec4 slots/components.
  // Must stay in sync with DegaussParams in wgsl/degauss.wgsl: dims0 =
  // (resolution.xy, displacement, time), dims1 = (speed, seed, direction, pad),
  // dims2 = (tileOffset.xy, fullResolution.xy). Explicit here so the tile
  // uniforms have stable slots instead of relying on struct-comment parsing.
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    displacement: { slot: 0, components: 'z' },
    time: { slot: 0, components: 'w' },
    speed: { slot: 1, components: 'x' },
    seed: { slot: 1, components: 'y' },
    direction: { slot: 1, components: 'z' },
    tileOffset: { slot: 2, components: 'xy' },
    fullResolution: { slot: 2, components: 'zw' }
  },

  globals: {
    displacement: {
      type: "float",
      default: 0.0625,
      uniform: "displacement",
      min: 0,
      max: 0.25,
      step: 0.001,
      ui: {
        label: "displacement",
        control: "slider"
      }
    },
    direction: {
      type: "float",
      default: 0.0,
      uniform: "direction",
      min: -180,
      max: 180,
      ui: {
        label: "direction",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      step: 1,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0.0,
      max: 2.0,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    }
  },
  defaultProgram: "search filter, synth\n\ntestPattern()\n.degauss()\n.write(o0)",
  passes: [
    {
      name: "main",
      program: "degauss",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        displacement: "displacement",
        speed: "speed",
        seed: "seed",
        direction: "direction"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
