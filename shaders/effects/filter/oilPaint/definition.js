import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Oil Paint",
  namespace: "filter",
  func: "oilPaint",
  tags: ["blur", "edges", "artist"],
  description: "Painterly oil-paint effect covering Facet, Paint Daubs, Dry Brush, Fresco, Palette Knife, and Sponge modes over a sector-Kuwahara flattening core",
  globals: {
    mode: {
      type: "int",
      default: 1,
      // Compile-time define: oilFlatten's facet radius branch AND oilPost's
      // six structurally different per-mode kernels both dispatch on this.
      // A runtime int dispatch would keep every mode's code path (tent
      // blur, S-curve, fbm banding, ...) live at every call site; baking
      // MODE lets each compiled variant carry only the branch it needs,
      // same rationale as filter/texture (MODE) and filter/grain (GRAIN_TYPE).
      define: "MODE",
      choices: {
        facet: 0,
        daubs: 1,
        dryBrush: 2,
        fresco: 3,
        knife: 4,
        sponge: 5
      },
      ui: { label: "mode", control: "dropdown" }
    },
    size: {
      type: "float", default: 6, uniform: "size",
      min: 1, max: 12, step: 0.5,
      ui: { label: "size", control: "slider" }
    },
    detail: {
      type: "float", default: 50, uniform: "detail",
      min: 0, max: 100,
      ui: {
        label: "detail", control: "slider",
        enabledBy: { param: "mode", neq: 0 }
      }
    },
    texture: {
      // Uniform renamed to "textureAmount" -- "texture" collides with
      // GLSL's builtin texture() sampling function, so a plain
      // `uniform float texture;` would fail to compile alongside the
      // texture() calls both passes need.
      type: "float", default: 20, uniform: "textureAmount",
      min: 0, max: 100,
      ui: { label: "texture", control: "slider" }
    },
    seed: {
      type: "int", default: 1, uniform: "seed",
      min: 1, max: 100,
      ui: {
        label: "seed", control: "slider",
        enabledBy: { param: "mode", eq: 5 }
      }
    }
  },
  textures: {
    // Kuwahara-flattened intermediate. Read by oilPost alongside the
    // original inputTex; a pass must never read and write the same
    // texture, so this stays a separate internal target.
    _paintTmp: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "flatten", program: "oilFlatten",
      inputs: { inputTex: "inputTex" },
      uniforms: { size: "size" },
      outputs: { fragColor: "_paintTmp" } },
    { name: "post", program: "oilPost",
      inputs: { inputTex: "inputTex", flatTex: "_paintTmp" },
      uniforms: { size: "size", detail: "detail", textureAmount: "textureAmount", seed: "seed" },
      outputs: { fragColor: "outputTex" } }
  ]
})
