import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/patchwork - needlepoint grid of solid-color squares raised by
 * luminance with lit bevel edges.
 *
 * Single pass on global (tile-aware), CENTER-ANCHORED pixel coordinates
 * (see glsl/patchwork.glsl's header for why center-anchoring is required
 * - the same cross-backend grid-boundary mismatch filter/extrude found
 * and fixed). Each squareSize-px cell samples a single solid color (a 3x3
 * mini-blur at the cell center, filter/extrude's cellAvgColor3x3
 * precedent) and a height h = lum(cellColor). The interior of every cell
 * is shaded by its own height alone (brighter cells slightly brighter);
 * the outer 15% rim of every cell is additionally beveled by an analytic
 * per-side light term - NOT filter/relief's gradient-based reliefShade (the height
 * field here is a piecewise-constant step function between cells, so a
 * local finite-difference gradient can't see across a cell boundary).
 * See the shader header for the full derivation, including the
 * raised-vs-carved polarity check against filter/craquelure's opposite
 * (carved) case.
 */
export default new Effect({
  name: "Patchwork",
  namespace: "filter",
  func: "patchwork",
  tags: ["pixel", "edges", "artist"],

  description: "Needlepoint grid of solid-color squares raised by luminance with lit bevel edges (Patchwork)",
  globals: {
    squareSize: {
      type: "float",
      default: 16,
      uniform: "squareSize",
      min: 4,
      max: 64,
      ui: {
        label: "square size",
        control: "slider"
      }
    },
    relief: {
      type: "float",
      default: 50,
      uniform: "relief",
      min: 0,
      max: 100,
      ui: {
        label: "relief",
        control: "slider"
      }
    },
    lightAngle: {
      type: "float",
      default: 135,
      uniform: "lightAngle",
      min: -180,
      max: 180,
      ui: {
        label: "light angle",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "patchwork",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
