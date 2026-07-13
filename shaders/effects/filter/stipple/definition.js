import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/stipple - Discrete random marks reproducing image tone, covering
 * three filters via `mode`:
 *
 *   pointillize (0)             - Colored dots on
 *                                  a paper background, one dot per
 *                                  jittered-grid Voronoi cell (cellSize
 *                                  px), sized by that cell's own darkness.
 *   mezzoDots/Lines/Strokes
 *   (1/2/3)                     - Mezzotint dots/lines/
 *                                  strokes conversion types: each RGB
 *                                  channel is independently hard-
 *                                  thresholded against shaped value noise
 *                                  scaled by grainSize, biased by density.
 *   reticulation (4)            - A two-tone ink/paper tonemap driven by
 *                                  luminance-modulated fBm clump noise.
 *
 * Single pass on global (tile-aware) pixel coordinates so every pattern
 * (Voronoi grid, noise field) is continuous across CLI render tiles.
 */
export default new Effect({
  name: "Stipple",
  namespace: "filter",
  func: "stipple",
  tags: ["pixel", "noise", "artist"],

  description: "Discrete random marks reproducing image tone: pointillize dots, mezzotint dots/lines/strokes, or reticulation (Pointillize, Mezzotint, Reticulation)",
  globals: {
    mode: {
      type: "int",
      default: 0,
      define: "MODE",
      choices: {
        pointillize: 0,
        mezzoDots: 1,
        mezzoLines: 2,
        mezzoStrokes: 3,
        reticulation: 4
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    cellSize: {
      type: "float",
      default: 8,
      uniform: "cellSize",
      min: 3,
      max: 64,
      ui: {
        label: "cell size",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    grainSize: {
      type: "float",
      default: 2,
      uniform: "grainSize",
      min: 0.5,
      max: 16,
      ui: {
        label: "grain size",
        control: "slider",
        enabledBy: { param: "mode", neq: 0 }
      }
    },
    density: {
      type: "float",
      default: 50,
      uniform: "density",
      min: 0,
      max: 100,
      ui: {
        label: "density",
        control: "slider",
        enabledBy: { param: "mode", neq: 0 }
      }
    },
    paperColor: {
      type: "color",
      default: [0.98, 0.96, 0.9],
      uniform: "paperColor",
      ui: {
        label: "paper color",
        control: "color",
        enabledBy: { param: "mode", eq: 0 }
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
      program: "stipple",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
