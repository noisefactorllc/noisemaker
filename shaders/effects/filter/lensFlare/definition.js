import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/lensFlare - classic Lens Flare
 * Single pass, additive over the source image. A fixed-size element
 * table (core glow, anamorphic streak, 6-point star, rainbow halo, and
 * a per-lensType ghost chain) is evaluated along the axis running from
 * the user-placed flare position through the image center and out the
 * other side: A(t) = mix(flarePos, 1 - flarePos, t), t=0 at the flare
 * itself, t=1 at the point mirrored across the image center. All tables
 * are bounded/unrolled - no dynamic loops, no per-pixel hashing.
 */
export default new Effect({
  name: "Lens Flare",
  namespace: "filter",
  func: "lensFlare",
  tags: ["lens", "artist"],

  description: "Additive lens flare with ghost chain, halo, and four lens types (Lens Flare)",
  globals: {
    brightness: {
      type: "float",
      default: 100,
      uniform: "brightness",
      min: 10,
      max: 300,
      ui: {
        label: "brightness",
        control: "slider"
      }
    },
    centerX: {
      type: "float",
      default: 0.35,
      uniform: "centerX",
      min: 0,
      max: 1,
      ui: {
        label: "center x",
        control: "slider"
      }
    },
    centerY: {
      type: "float",
      default: 0.35,
      uniform: "centerY",
      min: 0,
      max: 1,
      ui: {
        label: "center y",
        control: "slider"
      }
    },
    lensType: {
      type: "int",
      default: 0,
      // Compile-time define, not a runtime uniform. Each lens type selects a
      // fully distinct ghost-chain table (6/4/3 elements); baking LENS_TYPE
      // lets the compiler strip the other tables' dead branches instead of
      // evaluating every ghost for every pixel.
      define: "LENS_TYPE",
      choices: {
        zoom50_300: 0,
        prime35: 1,
        prime105: 2,
        moviePrime: 3
      },
      ui: {
        label: "lens type",
        control: "dropdown"
      }
    },
    tint: {
      type: "color",
      default: [1.0, 0.95, 0.85],
      uniform: "tint",
      ui: {
        label: "tint",
        control: "color"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "lensFlare",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
