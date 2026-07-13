import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/mosaicTiles - Two filters via `mode`:
 *
 *   mosaic (0)  - A square grid warped by value noise into wavy ceramic
 *                 tiles. Each tile pixelizes its image region to one
 *                 representative source sample, and tiles are separated
 *                 by grout that is
 *                 darkened and beveled with relief shading directional relief
 *                 shading (fixed 135-degree light, matching
 *                 filter/craquelure's convention).
 *   shifted (1) - A REGULAR (unwarped) square grid;
 *                 each tile is pixelized to one representative color from
 *                 a randomly shifted source position (a per-cell hash
 *                 offset, up to maxOffset% of a tile width), leaving a small
 *                 fixed gap between tiles that is filled per `gapFill`.
 *
 * groutWidth is a single shared uniform reused by BOTH modes for visual
 * consistency instead of adding a second "gap width" param (see
 * glsl/mosaicTiles.glsl's file header for the full reasoning): mosaic's
 * grout band half-width AND shifted's fixed inter-tile gap width are
 * both driven from it, but its UI control is gated to mosaic only -
 * shifted's gap is meant to read as a small fixed structural constant,
 * not a per-mode headline control, though the shader still consumes
 * whatever value the uniform currently holds in both branches.
 *
 * Single pass on global (tile-aware) pixel coordinates so the warp/grid
 * pattern is continuous across CLI render tiles.
 */
export default new Effect({
  name: "Mosaic Tiles",
  namespace: "filter",
  func: "mosaicTiles",
  tags: ["pixel", "noise", "artist"],

  description: "Wavy grouted ceramic tiles with beveled relief, or pixelized squares sampled from randomly offset sources with gap fill (Mosaic Tiles, Tiles)",
  globals: {
    mode: {
      type: "int",
      default: 0,
      define: "MODE",
      choices: {
        mosaic: 0,
        shifted: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    tileSize: {
      type: "float",
      default: 32,
      uniform: "tileSize",
      min: 4,
      max: 128,
      ui: {
        label: "tile size",
        control: "slider"
      }
    },
    groutWidth: {
      type: "float",
      default: 12,
      uniform: "groutWidth",
      min: 0,
      max: 100,
      ui: {
        label: "grout width",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    relief: {
      type: "float",
      default: 40,
      uniform: "relief",
      min: 0,
      max: 100,
      ui: {
        label: "relief",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    maxOffset: {
      type: "float",
      default: 25,
      uniform: "maxOffset",
      min: 0,
      max: 100,
      ui: {
        label: "max offset",
        control: "slider",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    gapFill: {
      type: "int",
      default: 0,
      uniform: "gapFill",
      choices: {
        background: 0,
        inverse: 1,
        unaltered: 2
      },
      ui: {
        label: "gap fill",
        control: "dropdown",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    backgroundColor: {
      type: "color",
      default: [0.1, 0.1, 0.1],
      uniform: "backgroundColor",
      ui: {
        label: "background color",
        control: "color",
        enabledBy: { and: [{ param: "mode", eq: 1 }, { param: "gapFill", eq: 0 }] }
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
  passes: [
    {
      name: "render",
      program: "mosaicTiles",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
