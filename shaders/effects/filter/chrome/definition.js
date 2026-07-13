import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/chrome - Chrome: liquid-metal rendering of the image's
 * luminance as a self-distorting reflective height field.
 *
 * chBlurH -> chBlurV: separable Gaussian blur of the source,
 * radius mapped from `smoothness` (mix(1.0, 16.0, smoothness/100) px). Two
 * internal textures because a pass cannot read and write the same texture
 * (relief/photocopy/stamp precedent).
 *
 * chMap: reads the blurred image's luminance as a height field h, self-
 * distorts its OWN sample point by h's central-difference gradient (a
 * cheap liquid-metal "refraction"), re-reads the height at the distorted
 * point, then runs that through an oscillating sine tone curve with a
 * rim-specular boost and a cool/blue-gray tint. This pass reads ONLY the
 * blurred texture for height/gradient math; inputTex is read solely for
 * its alpha channel.
 *
 * Gradient: a true central difference in UV space with 1px taps -
 *   grad = vec2(h(uv+(texel.x,0)) - h(uv-(texel.x,0)),
 *               h(uv+(0,texel.y)) - h(uv-(0,texel.y)))
 * (NOT the forward-difference relief shading relief-shade form, and NOT the 3x3 Sobel
 * Sobel gradient form).
 *
 * uv2 = uv + grad * (distortion/100) * 0.5: distortion scales the self-
 * warp strength; distortion = 0 collapses uv2 to uv exactly.
 * h2 = lum(blur at uv2): the height re-read after self-distortion - this
 * second read (not the original h) feeds the tone curve, so the "liquid"
 * warp visibly displaces the metal bands relative to the underlying image
 * shape.
 * cycles = mix(1.0, 7.0, detail/100): how many light/dark sine bands
 * appear per unit of height - Chrome's "Detail" slider.
 * v = 0.5 + 0.5*sin(h2*cycles*2*PI + h2*3.0): the oscillating tone curve;
 * the extra `+ h2*3.0` phase term breaks perfect periodicity slightly so
 * band spacing reads less mechanical, more liquid.
 * v += pow(v, 8.0) * 0.5, then clamp to [0,1]: a narrow rim-specular boost
 * that only brightens the curve's own peaks, like a highlight catching a
 * metal ridge.
 * outColor = clamp(vec3(v) * vec3(0.96, 0.98, 1.02), 0, 1): grayscale only
 * (no source color anywhere in this pass) with a faint cool/blue tint for
 * a steel/chrome cast. Alpha comes from inputTex's src, not the blur.
 *
 * Y-orientation: h/h2 sample _chBlur (a same-effect prior-pass FBO) through
 * the standard per-backend native uv convention (gl_FragCoord.xy/resolution
 * in GLSL, pos.xy/texSize in WGSL) with NO manual Y compensation. This
 * same-effect intermediate read is orientation-transparent
 * on both backends. The sine tone curve is a pure function of height only
 * - no directional light, no rotation, nothing else fragment-coordinate-
 * derived - so it carries no Y-sensitivity of its own either. GLSL and
 * WGSL are therefore a textually identical 1:1 port throughout.
 */
export default new Effect({
  name: "Chrome",
  namespace: "filter",
  func: "chrome",
  tags: ["blur", "edges", "artist"],

  description: "Liquid-metal chrome: self-distorting oscillating tone curve over a blurred-luminance height field",
  globals: {
    detail: {
      type: "float", default: 40, uniform: "detail",
      min: 0, max: 100,
      ui: { label: "detail", control: "slider" }
    },
    smoothness: {
      type: "float", default: 40, uniform: "smoothness",
      min: 0, max: 100,
      ui: { label: "smoothness", control: "slider" }
    },
    distortion: {
      type: "float", default: 30, uniform: "distortion",
      min: 0, max: 100,
      ui: { label: "distortion", control: "slider" }
    }
  },
  textures: {
    // Two internal textures: a pass cannot read and write the same texture
    // in one draw call (WebGL2 rejects this as a framebuffer/texture feedback
    // loop), so the horizontal and vertical blur stages need separate targets.
    _chBlurH: { width: "input", height: "input", format: "rgba8unorm" },
    _chBlur: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    { name: "blurH", program: "chBlurH",
      inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_chBlurH" } },
    { name: "blurV", program: "chBlurV",
      inputs: { inputTex: "_chBlurH" }, outputs: { fragColor: "_chBlur" } },
    { name: "map", program: "chMap",
      inputs: { inputTex: "inputTex", blurTex: "_chBlur" },
      outputs: { fragColor: "outputTex" } }
  ]
})
