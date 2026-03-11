import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/spookyTicker - Procedural scrolling pseudo-text ticker
 *
 * Renders rows of hash-based segmented glyphs scrolling horizontally
 * across the bottom of the screen, with shadow and screen blend.
 */
export default new Effect({
  name: "Spooky Ticker",
  namespace: "filter",
  func: "spookyTicker",
  tags: ["text"],

  description: "Scrolling pseudo-text ticker overlay",
  globals: {
    rows: {
      type: "int",
      default: 2,
      uniform: "rows",
      min: 1,
      max: 3,
      step: 1,
      ui: {
        label: "rows",
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
    alpha: {
      type: "float",
      default: 0.75,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    }
  },
  defaultProgram: "search filter, synth\n\nperlin()\n  .spookyTicker()\n  .write(o0)",
  passes: [
    {
      name: "main",
      program: "spookyTicker",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        speed: "speed",
        alpha: "alpha",
        rows: "rows",
        seed: "seed"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
