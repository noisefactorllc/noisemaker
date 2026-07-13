import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Watercolor",
  namespace: "filter",
  func: "watercolor",
  tags: ["blur", "edges", "artist"],
  description: "Simplified color washes with pigment pooling at edges and paper granulation",
  globals: {
    detail: {
      type: "float", default: 50, uniform: "detail",
      min: 0, max: 100,
      ui: { label: "detail", control: "slider" }
    },
    shadowIntensity: {
      type: "float", default: 40, uniform: "shadowIntensity",
      min: 0, max: 100,
      ui: { label: "shadow intensity", control: "slider" }
    },
    paperTexture: {
      type: "float", default: 30, uniform: "paperTexture",
      min: 0, max: 100,
      ui: { label: "paper texture", control: "slider" }
    }
  },
  textures: {
    // global_ prefix registers this as a double-buffered ping-pong surface
    // (pipeline.js createSurfaces()/adoptIterationBindings(), same mechanism
    // as filter/median's global_median_state and synth/reactionDiffusion's
    // global_rd_state). wcSimplify reads and writes this same logical
    // texture every iteration; the "global_" name is what makes that safe --
    // reads resolve to the surface's read buffer and writes target its write
    // buffer, two distinct physical textures, so there is no same-texture GL
    // feedback loop even though a plain "_" internal texture
    // (single-buffered) would hard-fail here. wcSeed re-copies
    // inputTex into this surface every frame, so the surface's cross-frame
    // read/write persistence is harmless.
    global_wc_state: { width: "input", height: "input", format: "rgba16f" }
  },
  passes: [
    { name: "seed", program: "wcSeed",
      inputs: { inputTex: "inputTex" },
      outputs: { fragColor: "global_wc_state" } },
    // repeat: 2 is a FIXED literal count (not a uniform name) -- two stride
    // simplification passes composing coarse median-like smoothing, per
    // pipeline.js resolveRepeatCount()'s numeric-literal branch. Legal to
    // read+write global_wc_state every iteration for the same reason as the
    // seed pass above (global_ double-buffering): pipeline.js
    // adoptIterationBindings() mirrors each iteration's frame-local ping-pong
    // bindings so the seed -> repeat -> final shape composes correctly.
    { name: "wcSimplify", program: "wcSimplify", repeat: 2,
      inputs: { inputTex: "global_wc_state" },
      outputs: { fragColor: "global_wc_state" } },
    { name: "wcComposite", program: "wcComposite",
      inputs: { inputTex: "inputTex", simplifiedTex: "global_wc_state" },
      outputs: { fragColor: "outputTex" } }
  ]
})
