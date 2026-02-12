import { Effect } from '../../../src/runtime/effect.js'

/**
 * mixer/shadow - Shadow / Glow
 *
 * Uses one input as a mask to cast a shadow or glow onto the other input.
 * Extracts a single channel from the mask, applies threshold, then
 * offsets, blurs, and spreads the result to create a shadow shape.
 */
export default new Effect({
  name: "Shadow",
  namespace: "mixer",
  func: "shadow",
  tags: ["color"],

  description: "Cast a shadow or glow from one input onto another",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    maskSource: {
      type: "int",
      default: 0,
      uniform: "shadowMaskSource",
      choices: {
        sourceA: 0,
        sourceB: 1
      },
      ui: {
        label: "mask source",
        control: "dropdown"
      }
    },
    sourceChannel: {
      type: "int",
      default: 0,
      uniform: "shadowSourceChannel",
      choices: {
        r: 0,
        g: 1,
        b: 2,
        a: 3
      },
      ui: {
        label: "source channel",
        control: "dropdown"
      }
    },
    threshold: {
      type: "float",
      default: 0.5,
      uniform: "shadowThreshold",
      min: 0,
      max: 1,
      randMin: 0.25,
      randMax: 0.75,
      ui: {
        label: "threshold",
        control: "slider"
      }
    },
    color: {
      type: "color",
      default: [0, 0, 0],
      uniform: "shadowColor",
      ui: {
        label: "color",
        control: "color",
        category: "shadow"
      }
    },
    blur: {
      type: "float",
      default: 1,
      uniform: "shadowBlur",
      min: 0,
      max: 3,
      zero: 0,
      ui: {
        label: "blur",
        control: "slider",
        category: "shadow"
      }
    },
    spread: {
      type: "float",
      default: 0.0,
      uniform: "shadowSpread",
      min: 0,
      max: 1,
      randMax: 0.5,
      ui: {
        label: "spread",
        control: "slider",
        category: "shadow"
      }
    },
    offsetX: {
      type: "float",
      default: 0.1,
      uniform: "shadowOffsetX",
      min: -1,
      max: 1,
      randMin: -0.2,
      randMax: 0.2,
      zero: 0,
      ui: {
        label: "offset x",
        control: "slider",
        category: "offset"
      }
    },
    offsetY: {
      type: "float",
      default: -0.1,
      uniform: "shadowOffsetY",
      min: -1,
      max: 1,
      randMin: -0.2,
      randMax: 0.2,
      zero: 0,
      ui: {
        label: "offset y",
        control: "slider",
        category: "offset"
      }
    },
    wrap: {
      type: "int",
      default: 1,
      uniform: "shadowWrap",
      choices: {
        hide: 0,
        mirror: 1,
        repeat: 2,
        clamp: 3
      },
      ui: {
        label: "wrap",
        control: "dropdown",
        category: "offset"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "shadow",
      inputs: {
        inputTex: "inputTex",
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
