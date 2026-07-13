import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/photocopy - Photocopy: ink-on-paper via a symmetric
 * difference-of-Gaussians edge term plus a direct tonal ink fill.
 *
 * pcBlurH -> pcBlurV: separable Gaussian blur of the source,
 * radius mapped from `detail` (mix(1.0, 24.0, (detail-1)/99) px). Two
 * internal textures because a pass cannot read and write the same texture
 * (relief/highPass/plasticWrap precedent).
 *
 * pcCombine: band = lum(src) - lum(blur) is the DoG signal. edgeInk =
 * clamp(abs(band) * edgeGain, 0, 1) inks BOTH sides of an edge (a thin
 * double-line contour), gained by `darkness`. toneInk = 1 -
 * smoothstep(toneLo, toneHi, lum(src)) independently fills the source's own
 * mid-dark regions with solid ink, so the image's actual shapes/tones read
 * as ink even where edges are faint (soft/low-contrast content has a tiny
 * DoG band nearly everywhere, which starved the old edge-only formula down
 * to near-blank paper - see help.md). Both `edgeGain` and the tonal
 * threshold `toneHi` scale with `darkness`, so one knob raises overall ink
 * coverage together. ink = clamp(max(edgeInk, toneInk), 0, 1), tonemapped
 * (ink/paper tonemapping) as `tonemap2(1 - ink, inkColor, paperColor)` (t=1 -> paper, so
 * 1-ink means full ink -> ink color). Alpha from src.
 *
 * DoG is isotropic (no directional light, no rotation, no fragment-
 * coordinate-derived vectors), so this effect needs no backend-specific
 * Y compensation anywhere - GLSL and
 * WGSL are textually identical throughout.
 */
export default new Effect({
  name: "Photocopy",
  namespace: "filter",
  func: "photocopy",
  tags: ["blur", "edges", "artist"],

  description: "Ink-on-paper via edge and tonal difference-of-Gaussians, like a bad photocopy",
  globals: {
    detail: {
      type: "float", default: 30, uniform: "detail",
      min: 1, max: 100,
      ui: { label: "detail", control: "slider" }
    },
    darkness: {
      type: "float", default: 75, uniform: "darkness",
      min: 0, max: 100,
      ui: { label: "darkness", control: "slider" }
    },
    inkColor: {
      type: "color", default: [0.1, 0.1, 0.1], uniform: "inkColor",
      ui: { label: "ink color", control: "color" }
    },
    paperColor: {
      type: "color", default: [0.96, 0.94, 0.88], uniform: "paperColor",
      ui: { label: "paper color", control: "color" }
    }
  },
  textures: {
    // Two internal textures: a pass cannot read and write the same texture
    // in one draw call (WebGL2 rejects this as a framebuffer/texture feedback
    // loop), so the horizontal and vertical blur stages need separate targets.
    _pcBlurH: { width: "input", height: "input", format: "rgba8unorm" },
    _pcBlur: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "blurH", program: "pcBlurH",
      inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_pcBlurH" } },
    { name: "blurV", program: "pcBlurV",
      inputs: { inputTex: "_pcBlurH" }, outputs: { fragColor: "_pcBlur" } },
    { name: "combine", program: "pcCombine",
      inputs: { inputTex: "inputTex", blurTex: "_pcBlur" },
      outputs: { fragColor: "outputTex" } }
  ]
})
