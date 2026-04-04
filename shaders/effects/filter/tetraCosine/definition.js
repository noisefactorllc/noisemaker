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
// data[4].x = rotation
const uniformLayout = {
  offsetR: { slot: 0, components: 'x' },
  offsetG: { slot: 0, components: 'y' },
  offsetB: { slot: 0, components: 'z' },
  colorMode: { slot: 0, components: 'w' },
  ampR: { slot: 1, components: 'x' },
  ampG: { slot: 1, components: 'y' },
  ampB: { slot: 1, components: 'z' },
  repeat: { slot: 1, components: 'w' },
  freqR: { slot: 2, components: 'x' },
  freqG: { slot: 2, components: 'y' },
  freqB: { slot: 2, components: 'z' },
  offset: { slot: 2, components: 'w' },
  phaseR: { slot: 3, components: 'x' },
  phaseG: { slot: 3, components: 'y' },
  phaseB: { slot: 3, components: 'z' },
  alpha: { slot: 3, components: 'w' },
  rotation: { slot: 4, components: 'x' },
  time: { slot: 4, components: 'y' }
}

export default new Effect({
  name: "TetraCosine",
  namespace: "filter",
  func: "tetraCosine",
  tags: ["color", "palette"],
  openCategories: ["general", "mapping"],

  description: "Apply Tetra cosine palettes based on luminance",

  uniformLayout,

  globals: {
    // === Color Mode ===
    colorMode: {
      type: "int",
      default: 0,
      uniform: "colorMode",
      choices: {
        rgb: 0,
        hsv: 1,
        oklab: 2,
        oklch: 3
      },
      ui: {
        label: "color mode",
        control: "dropdown"
      }
    },

    // === Offset (center/bias) ===
    offsetR: {
      type: "float",
      default: 0.5,
      uniform: "offsetR",
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
      uniform: "offsetG",
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
      uniform: "offsetB",
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
      uniform: "ampR",
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
      uniform: "ampG",
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
      uniform: "ampB",
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
      type: "int",
      default: 1,
      uniform: "freqR",
      min: 0,
      max: 4,
      ui: {
        label: "freq r",
        control: "slider",
        category: "frequency"
      }
    },
    freqG: {
      type: "int",
      default: 1,
      uniform: "freqG",
      min: 0,
      max: 4,
      ui: {
        label: "freq g",
        control: "slider",
        category: "frequency"
      }
    },
    freqB: {
      type: "int",
      default: 1,
      uniform: "freqB",
      min: 0,
      max: 4,
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
      uniform: "phaseR",
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
      uniform: "phaseG",
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
      uniform: "phaseB",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "phase b",
        control: "slider",
        category: "phase"
      }
    },

    // === Rotation ===
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      choices: { none: 0, fwd: 1, back: -1 },
      ui: {
        label: "rotation",
        control: "dropdown"
      }
    },

    // === Mapping Controls ===
    repeat: {
      type: "float",
      default: 1,
      uniform: "repeat",
      min: 0,
      max: 10,
      randChoices: [1, 2, 3, 4, 5],
      step: 0.01,
      ui: {
        label: "repeat",
        control: "slider",
        category: "mapping"
      }
    },
    offset: {
      type: "float",
      default: 0.0,
      uniform: "offset",
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
      uniform: "alpha",
      min: 0,
      max: 1,
      randMin: 0.5,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    }
  },
  defaultProgram: "search filter, synth\n\nnoise()\n  .tetraCosine()\n  .write(o0)",
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
