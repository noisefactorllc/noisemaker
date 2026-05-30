import { Effect } from '../../../src/runtime/effect.js'

/**
 * Temporal Chromatic Aberration
 *
 * Separates the red, green and blue channels by a *temporal* (N-frame) delay rather
 * than a spatial offset: each output channel is sampled from a different past frame, so
 * moving content leaves colour trails that lag/lead in time. This is the temporal
 * counterpart to the spatial aberration effects (simpleAberration, chromaticAberration).
 *
 * Mechanism: an 8-stage RGBA shift register ("bucket brigade"), generalising feedback's
 * single-frame _selfTex into an N-frame delay line built only from render passes and
 * persistent textures. After each frame _hk holds input(T-k). The read pass samples the
 * live input (delay 0) plus _h1.._h8 and, per channel, picks a fractional frame delay by
 * interpolating between adjacent stored frames. Eight tail-first copy passes then shift
 * the line for the next frame.
 *
 * See docs/superpowers/specs/2026-05-30-temporal-chromatic-aberration-design.md
 */
export default new Effect({
  name: "Temporal Chromatic Aberration",
  namespace: "filter",
  func: "temporalAberration",
  tags: ["color", "lens"],

  description: "Chromatic aberration via per-channel temporal frame delay",

  globals: {
    redDelay: {
      type: "float",
      default: 0,
      uniform: "redDelay",
      min: 0,
      max: 8,
      step: 0.1,
      ui: {
        label: "red delay",
        control: "slider"
      }
    },
    greenDelay: {
      type: "float",
      default: 4,
      uniform: "greenDelay",
      min: 0,
      max: 8,
      step: 0.1,
      ui: {
        label: "green delay",
        control: "slider"
      }
    },
    blueDelay: {
      type: "float",
      default: 8,
      uniform: "blueDelay",
      min: 0,
      max: 8,
      step: 0.1,
      ui: {
        label: "blue delay",
        control: "slider"
      }
    }
  },

  defaultProgram: `search filter, synth

noise(
  speed: 40,
  colorMode: mono,
  ridges: true
)
  .temporalAberration()
  .write(o0)`,

  // WGSL packing for the array<vec4<f32>, N> uniform. GLSL uses the named uniforms above.
  uniformLayouts: {
    temporalAberration: {
      redDelay: { slot: 0, components: 'x' },
      greenDelay: { slot: 0, components: 'y' },
      blueDelay: { slot: 0, components: 'z' }
    }
  },

  // Eight persistent history stages. `_`-prefixed textures survive frame-to-frame and
  // initialise to zero (alpha 0 => "empty", handled by the read shader).
  textures: {
    _h1: { width: "input", height: "input", format: "rgba8unorm" },
    _h2: { width: "input", height: "input", format: "rgba8unorm" },
    _h3: { width: "input", height: "input", format: "rgba8unorm" },
    _h4: { width: "input", height: "input", format: "rgba8unorm" },
    _h5: { width: "input", height: "input", format: "rgba8unorm" },
    _h6: { width: "input", height: "input", format: "rgba8unorm" },
    _h7: { width: "input", height: "input", format: "rgba8unorm" },
    _h8: { width: "input", height: "input", format: "rgba8unorm" }
  },

  passes: [
    // Read pass runs first, sampling the pre-shift history (delay 0 = inputTex, k = _hk).
    {
      name: "main",
      program: "temporalAberration",
      inputs: {
        inputTex: "inputTex",
        h1: "_h1",
        h2: "_h2",
        h3: "_h3",
        h4: "_h4",
        h5: "_h5",
        h6: "_h6",
        h7: "_h7",
        h8: "_h8"
      },
      outputs: {
        fragColor: "outputTex"
      }
    },
    // Tail-first shift: each stage copies its source's last-frame value before that
    // source is overwritten later this frame.
    {
      name: "shift8",
      program: "delayShift",
      inputs: { srcTex: "_h7" },
      outputs: { fragColor: "_h8" }
    },
    {
      name: "shift7",
      program: "delayShift",
      inputs: { srcTex: "_h6" },
      outputs: { fragColor: "_h7" }
    },
    {
      name: "shift6",
      program: "delayShift",
      inputs: { srcTex: "_h5" },
      outputs: { fragColor: "_h6" }
    },
    {
      name: "shift5",
      program: "delayShift",
      inputs: { srcTex: "_h4" },
      outputs: { fragColor: "_h5" }
    },
    {
      name: "shift4",
      program: "delayShift",
      inputs: { srcTex: "_h3" },
      outputs: { fragColor: "_h4" }
    },
    {
      name: "shift3",
      program: "delayShift",
      inputs: { srcTex: "_h2" },
      outputs: { fragColor: "_h3" }
    },
    {
      name: "shift2",
      program: "delayShift",
      inputs: { srcTex: "_h1" },
      outputs: { fragColor: "_h2" }
    },
    {
      name: "shift1",
      program: "delayShift",
      inputs: { srcTex: "inputTex" },
      outputs: { fragColor: "_h1" }
    }
  ]
})
