import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/hatch - six-mode hand-drawn sketch engine covering
 * Graphic Pen, Charcoal, Chalk & Charcoal, Conte Crayon, Crosshatch, and
 * Colored Pencil filters via `mode`.
 *
 * Every mode reads the same stroke field: s(theta) = vnoise(rotate2D(gc,
 * theta) * vec2(1/stretch, 0.9)), sampled on the tile-aware GLOBAL integer
 * pixel coordinate (gc) so the pattern is seamless across CLI render
 * tiles. stretch = mix(4, 40, strokeLength/100) sets how many pixels a
 * single "fiber" of noise runs along theta before changing (short choppy
 * strokes at strokeLength=0, long strokes at strokeLength=100); the 0.9
 * cross-stroke factor keeps the perpendicular axis close to full-pixel
 * frequency, so each stroke reads as a thin fiber rather than a blob.
 * theta comes from `direction` (0/45/90/135deg) and rotates the global
 * fragment coordinate with the same numeric transform on both backends.
 *
 * tone t = lum(src) + (balance-50)/100 is the shared shadow/highlight
 * signal every mode thresholds against; `pressure` biases ink coverage/
 * darkness/contrast per mode (see glsl/hatch.glsl for the exact per-mode
 * role). Pen and conte reduce to the core formula at pressure=50 default
 * and only nudge away from it as pressure moves, keeping `pressure`
 * responsive in every mode without changing any mode's documented
 * default look).
 *
 *   pen (0)           - Graphic Pen: ink = step(s, 1-t) at a single
 *                        theta, tonemapped straight to ink/paper - the
 *                        starkest, most binary mode.
 *   charcoal (1)       - Charcoal: a rougher 2-octave stroke noise inks
 *                        only the shadow region (t < 0.55, soft-gated),
 *                        paper elsewhere; pressure scales both ink
 *                        coverage and how dark the ink itself reads.
 *   chalkCharcoal (2)  - Chalk & Charcoal: mid-gray paper base with dark
 *                        charcoal strokes at theta in the shadows
 *                        (t<0.4) and paper-colored chalk strokes at
 *                        theta+90 in the highlights (t>0.6); pressure
 *                        sharpens both stroke gates' edges (contrast).
 *   conte (3)          - Conte Crayon: a two-level dark/light remap
 *                        whose midtone band is filled with fbm-textured
 *                        stroke noise instead of a flat gradient.
 *   crosshatch (4)     - Crosshatch: COLOR-PRESERVING - keeps src.rgb
 *                        and multiplies in up to 3 stroke fields (theta,
 *                        theta+45, theta-45), each gated to a
 *                        progressively darker tone band so shadows
 *                        accumulate more crossing hatch layers than
 *                        midtones; pressure is the darkness gain of each
 *                        layer.
 *   coloredPencil (5)  - Colored Pencil: COLOR-PRESERVING - image color
 *                        shows through only inside the stroke mask
 *                        (mix(paper, src, mask)); mask density follows
 *                        tone (denser in shadow) and bends to follow
 *                        local contours near strong edges (Sobel gradient gradient
 *                        direction), like pencil hatching drawn along
 *                        the subject's contours; pressure = coverage.
 *
 * Single pass, tile-aware global coordinates for every noise lookup.
 */
export default new Effect({
  name: "Hatch",
  namespace: "filter",
  func: "hatch",
  tags: ["noise", "edges", "artist"],

  description: "Hand-drawn sketch engine covering Graphic Pen, Charcoal, Chalk & Charcoal, Conte Crayon, Crosshatch, and Colored Pencil filters",
  globals: {
    mode: {
      type: "int",
      default: 0,
      // Compile-time define: each mode is a structurally different
      // shading recipe (binary ink threshold vs multiplicative
      // color-preserving hatch vs two-level remap); baking MODE keeps
      // every compiled variant carrying only the branch it needs, same
      // rationale as filter/oilPaint and filter/texture.
      define: "MODE",
      choices: {
        pen: 0,
        charcoal: 1,
        chalkCharcoal: 2,
        conte: 3,
        crosshatch: 4,
        coloredPencil: 5
      },
      ui: { label: "mode", control: "dropdown" }
    },
    strokeLength: {
      type: "float", default: 50, uniform: "strokeLength",
      min: 0, max: 100,
      ui: { label: "stroke length", control: "slider" }
    },
    direction: {
      type: "int", default: 0, uniform: "direction",
      choices: {
        rightDiag: 0,
        horizontal: 1,
        leftDiag: 2,
        vertical: 3
      },
      ui: { label: "direction", control: "dropdown" }
    },
    balance: {
      type: "float", default: 50, uniform: "balance",
      min: 0, max: 100,
      ui: { label: "balance", control: "slider" }
    },
    pressure: {
      type: "float", default: 50, uniform: "pressure",
      min: 0, max: 100,
      ui: { label: "pressure", control: "slider" }
    },
    inkColor: {
      // Used by pen/charcoal/chalkCharcoal/conte only - crosshatch is
      // fully color-preserving and coloredPencil's "ink" is the source
      // image's own color, not this uniform.
      type: "color", default: [0.1, 0.1, 0.1], uniform: "inkColor",
      ui: {
        label: "ink color", control: "color",
        enabledBy: { param: "mode", notIn: [4, 5] }
      }
    },
    paperColor: {
      // Used by every mode except crosshatch (fully color-preserving,
      // touches neither ink nor paper).
      type: "color", default: [0.96, 0.94, 0.88], uniform: "paperColor",
      ui: {
        label: "paper color", control: "color",
        enabledBy: { param: "mode", notIn: [4] }
      }
    }
  },
  passes: [
    { name: "hatch", program: "hatch",
      inputs: { inputTex: "inputTex" },
      uniforms: {
        strokeLength: "strokeLength",
        direction: "direction",
        balance: "balance",
        pressure: "pressure",
        inkColor: "inkColor",
        paperColor: "paperColor"
      },
      outputs: { fragColor: "outputTex" } }
  ]
})
