import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/directionalBlur - Linear directional motion blur
 * Averages a fixed 32-tap comb along a straight line at `angle`, spanning
 * `distance` px total (Motion Blur). Distinct from
 * filter/motionBlur, which is temporal frame-blending.
 */
export default new Effect({
  name: "Directional Blur",
  namespace: "filter",
  func: "directionalBlur",
  tags: ["blur", "artist"],

  description: "Linear motion blur along a single direction (Motion Blur)",
  globals: {
    angle: {
      type: "float",
      default: 0,
      uniform: "angle",
      min: -180,
      max: 180,
      ui: {
        label: "angle",
        control: "slider"
      }
    },
    distance: {
      type: "float",
      default: 60,
      // Shader-side uniform is named "blurDistance", not "distance": GLSL
      // and WGSL both have a built-in distance() function, and shadowing
      // it with a global uniform of the same name risks a compiler
      // redefinition error.
      // The DSL/JS-facing param name stays "distance" per spec.
      uniform: "blurDistance",
      min: 1,
      max: 200,
      ui: {
        label: "distance",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "directionalBlur",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
