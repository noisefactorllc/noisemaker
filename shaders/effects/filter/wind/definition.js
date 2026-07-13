import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/wind - Coherent horizontal trails integrated from brighter
 * upwind image structure. Wind, Blast, and Stagger vary the trail decay
 * and phase while sharing a smooth threshold and continuous scanlines.
 */
export default new Effect({
  name: "Wind",
  namespace: "filter",
  func: "wind",
  tags: ["distort", "artist"],

  description: "Soft directional streaks drawn from bright edges, with wind, blast, and stagger methods",
  globals: {
    method: {
      type: "int",
      default: 1,
      define: "METHOD",
      choices: {
        wind: 0,
        blast: 1,
        stagger: 2
      },
      ui: {
        label: "method",
        control: "dropdown"
      }
    },
    direction: {
      type: "int",
      default: 0,
      uniform: "direction",
      choices: {
        fromLeft: 0,
        fromRight: 1
      },
      ui: {
        label: "direction",
        control: "dropdown"
      }
    },
    strength: {
      type: "float",
      default: 90,
      uniform: "strength",
      min: 0,
      max: 100,
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    threshold: {
      type: "float",
      default: 10,
      uniform: "threshold",
      min: 0,
      max: 100,
      ui: {
        label: "threshold",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "wind",
      program: "wind",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
