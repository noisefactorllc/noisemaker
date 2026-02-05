import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/tetraCosine - Tetra Cosine Gradient Color Mapping
 *
 * Applies a cosine gradient palette to an input image based on luminance.
 * Uses the Inigo Quilez cosine palette formula: color(t) = offset + amp * cos(2π * (freq * t + phase))
 *
 * Compatible with Tetra's cosine palette format. Supports RGB, HSV, OkLab, and OKLCH color modes.
 *
 * UI provides a mini version of Tetra's cosine editor with:
 * - Preview gradient at top
 * - 12 sliders: 4 parameter groups (offset, amp, freq, phase) × 3 channels
 * - Color mode selector
 * - Config file loading support
 */

// Maps uniform names to packed vec4 slots for WGSL
// data[0].xyz = offset (R, G, B), data[0].w = colorMode
// data[1].xyz = amp (R, G, B), data[1].w = repeat
// data[2].xyz = freq (R, G, B), data[2].w = offset (mapping)
// data[3].xyz = phase (R, G, B), data[3].w = alpha
const uniformLayout = {
  tetraCosineOffsetR: { slot: 0, components: 'x' },
  tetraCosineOffsetG: { slot: 0, components: 'y' },
  tetraCosineOffsetB: { slot: 0, components: 'z' },
  tetraCosineColorMode: { slot: 0, components: 'w' },
  tetraCosineAmpR: { slot: 1, components: 'x' },
  tetraCosineAmpG: { slot: 1, components: 'y' },
  tetraCosineAmpB: { slot: 1, components: 'z' },
  tetraCosineRepeat: { slot: 1, components: 'w' },
  tetraCosineFreqR: { slot: 2, components: 'x' },
  tetraCosineFreqG: { slot: 2, components: 'y' },
  tetraCosineFreqB: { slot: 2, components: 'z' },
  tetraCosineOffset: { slot: 2, components: 'w' },
  tetraCosinePhaseR: { slot: 3, components: 'x' },
  tetraCosinePhaseG: { slot: 3, components: 'y' },
  tetraCosinePhaseB: { slot: 3, components: 'z' },
  tetraCosineAlpha: { slot: 3, components: 'w' }
}

export default new Effect({
  name: "TetraCosine",
  namespace: "filter",
  func: "tetraCosine",
  tags: ["color"],

  description: "Apply Tetra cosine gradient palettes based on luminance",

  uniformLayout,

  globals: {
    // === Color Mode ===
    colorMode: {
      type: "int",
      default: 0,
      uniform: "tetraCosineColorMode",
      choices: {
        rgb: 0,
        hsv: 1,
        oklab: 2,
        oklch: 3
      },
      ui: {
        label: "color mode",
        control: "dropdown",
        category: "mode"
      }
    },

    // === Offset (center/bias) ===
    offsetR: {
      type: "float",
      default: 0.5,
      uniform: "tetraCosineOffsetR",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "offset r",
        control: "slider",
        category: "offset"
      }
    },
    offsetG: {
      type: "float",
      default: 0.5,
      uniform: "tetraCosineOffsetG",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "offset g",
        control: "slider",
        category: "offset"
      }
    },
    offsetB: {
      type: "float",
      default: 0.5,
      uniform: "tetraCosineOffsetB",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "offset b",
        control: "slider",
        category: "offset"
      }
    },

    // === Amplitude ===
    ampR: {
      type: "float",
      default: 0.5,
      uniform: "tetraCosineAmpR",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "amp r",
        control: "slider",
        category: "amplitude"
      }
    },
    ampG: {
      type: "float",
      default: 0.5,
      uniform: "tetraCosineAmpG",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "amp g",
        control: "slider",
        category: "amplitude"
      }
    },
    ampB: {
      type: "float",
      default: 0.5,
      uniform: "tetraCosineAmpB",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "amp b",
        control: "slider",
        category: "amplitude"
      }
    },

    // === Frequency ===
    freqR: {
      type: "float",
      default: 1.0,
      uniform: "tetraCosineFreqR",
      min: 0,
      max: 4,
      step: 0.1,
      ui: {
        label: "freq r",
        control: "slider",
        category: "frequency"
      }
    },
    freqG: {
      type: "float",
      default: 1.0,
      uniform: "tetraCosineFreqG",
      min: 0,
      max: 4,
      step: 0.1,
      ui: {
        label: "freq g",
        control: "slider",
        category: "frequency"
      }
    },
    freqB: {
      type: "float",
      default: 1.0,
      uniform: "tetraCosineFreqB",
      min: 0,
      max: 4,
      step: 0.1,
      ui: {
        label: "freq b",
        control: "slider",
        category: "frequency"
      }
    },

    // === Phase ===
    phaseR: {
      type: "float",
      default: 0.0,
      uniform: "tetraCosinePhaseR",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "phase r",
        control: "slider",
        category: "phase"
      }
    },
    phaseG: {
      type: "float",
      default: 0.33,
      uniform: "tetraCosinePhaseG",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "phase g",
        control: "slider",
        category: "phase"
      }
    },
    phaseB: {
      type: "float",
      default: 0.67,
      uniform: "tetraCosinePhaseB",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "phase b",
        control: "slider",
        category: "phase"
      }
    },

    // === Mapping Controls ===
    repeat: {
      type: "float",
      default: 1.0,
      uniform: "tetraCosineRepeat",
      min: 0.1,
      max: 10,
      step: 0.1,
      ui: {
        label: "repeat",
        control: "slider",
        category: "mapping"
      }
    },
    offset: {
      type: "float",
      default: 0.0,
      uniform: "tetraCosineOffset",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "offset",
        control: "slider",
        category: "mapping"
      }
    },

    // === Output ===
    alpha: {
      type: "float",
      default: 1.0,
      uniform: "tetraCosineAlpha",
      min: 0,
      max: 1,
      randMin: 0.5,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider",
        category: "output"
      }
    }
  },

  passes: [
    {
      name: "render",
      program: "tetraCosine",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
