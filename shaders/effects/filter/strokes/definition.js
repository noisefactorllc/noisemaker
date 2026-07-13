import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/strokes - directional brush-mark engine with angled, sprayed,
 * dark, sumi-e, and smudge modes. See glsl/stkSmear.glsl
 * for the full per-mode algorithm derivation.
 *
 * MODE selects each recipe entirely inside stkSmear at compile time. Sumi-e
 * evaluates its local erosion once in that shader and combines it with the
 * directional ink smear; other variants compile without erosion work. stkPost
 * sharpens the result while restoring alpha from the original source.
 */
export default new Effect({
  name: "Strokes",
  namespace: "filter",
  func: "strokes",
  tags: ["blur", "edges", "artist"],
  description: "Directional brush-mark engine with angled, sprayed, dark, sumi-e, and smudge modes",
  globals: {
    mode: {
      type: "int",
      default: 0,
      // Compile-time define: each mode is a structurally different
      // directional-accumulation recipe (two-field tone blend vs
      // jittered spray vs pre-eroded ink vs gradient-following smudge);
      // baking MODE keeps every compiled variant carrying only the
      // branch it needs, same rationale as filter/oilPaint and
      // filter/hatch.
      define: "MODE",
      choices: {
        angled: 0,
        sprayed: 1,
        dark: 2,
        sumiE: 3,
        smudge: 4
      },
      ui: { label: "mode", control: "dropdown" }
    },
    length: {
      // Uniform renamed to "strokeLength" -- GLSL/WGSL both have a
      // builtin length() function, so a plain `uniform float length;`
      // risks a compiler redefinition error (same rationale as
      // filter/directionalBlur's distance -> blurDistance rename).
      type: "float", default: 40, uniform: "strokeLength",
      min: 0, max: 100,
      ui: { label: "length", control: "slider" }
    },
    balance: {
      type: "float", default: 50, uniform: "balance",
      min: 0, max: 100,
      ui: {
        label: "balance", control: "slider",
        enabledBy: { param: "mode", in: [0, 2] }
      }
    },
    intensity: {
      type: "float", default: 50, uniform: "intensity",
      min: 0, max: 100,
      ui: {
        label: "intensity", control: "slider",
        enabledBy: { param: "mode", in: [1, 2, 3] }
      }
    },
    sharpness: {
      type: "float", default: 30, uniform: "sharpness",
      min: 0, max: 100,
      ui: { label: "sharpness", control: "slider" }
    }
  },
  textures: {
    _stkTmp: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "smear", program: "stkSmear",
      inputs: { inputTex: "inputTex" },
      uniforms: { strokeLength: "strokeLength", balance: "balance", intensity: "intensity" },
      outputs: { fragColor: "_stkTmp" } },
    { name: "post", program: "stkPost",
      inputs: { inputTex: "inputTex", smearTex: "_stkTmp" },
      uniforms: { sharpness: "sharpness" },
      outputs: { fragColor: "outputTex" } }
  ]
})
