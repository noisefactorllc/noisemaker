import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/scatter - Random per-pixel pixel scatter (Diffuse, all
 * four modes, and Spatter's core dissolve), plus frosted-glass looks.
 * Two passes: scatterJitter samples the input at a random per-pixel offset
 * within `radius` px (mode dispatch below), scatterSmooth re-blends that
 * result with a 3x3 tent blur by `smoothness` (Spatter's Smoothness
 * parameter). Distinct from filter/spatter, which is an unrelated
 * paint-splat overlay.
 */
export default new Effect({
  name: "Scatter",
  namespace: "filter",
  func: "scatter",
  tags: ["noise", "artist"],

  description: "Random per-pixel scatter with darken/lighten/anisotropic/clumped modes (Diffuse, Spatter)",
  globals: {
    radius: {
      type: "float",
      default: 12,
      uniform: "radius",
      min: 1,
      max: 25,
      ui: {
        label: "radius",
        control: "slider"
      }
    },
    mode: {
      type: "int",
      default: 0,
      define: "MODE",
      choices: {
        normal: 0,
        darkenOnly: 1,
        lightenOnly: 2,
        anisotropic: 3,
        clumped: 4
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    smoothness: {
      type: "float",
      default: 0,
      uniform: "smoothness",
      min: 0,
      max: 100,
      ui: {
        label: "smoothness",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    }
  },
  textures: {
    // Single internal texture: a pass cannot read and write the same
    // texture in one draw call (WebGL2 rejects this as a framebuffer/
    // texture feedback loop), so the jitter and smooth stages need
    // separate targets.
    _scatterTmp: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    {
      name: "scatterJitter",
      program: "scatterJitter",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "_scatterTmp"
      }
    },
    {
      name: "scatterSmooth",
      program: "scatterSmooth",
      inputs: {
        inputTex: "_scatterTmp"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
