/*
 * Chrome - map pass.
 *
 * Reads the blurred image (_chBlur, written by chBlurH/chBlurV) as a
 * luminance height field h (luminance lum), self-distorts its OWN sample point by
 * h's central-difference gradient (a cheap liquid-metal "refraction"), then
 * runs the re-sampled height through an oscillating sine tone curve with a
 * rim-specular boost and a cool/blue-gray tint. This pass reads ONLY the
 * blurred texture for height/gradient math; inputTex is read solely for its
 * alpha channel.
 *
 * Gradient: a true central difference in UV space with 1px taps -
 *   grad = vec2(h(uv + (texel.x,0)) - h(uv - (texel.x,0)),
 *               h(uv + (0,texel.y)) - h(uv - (0,texel.y)))
 * (NOT the forward-difference relief shading relief-shade form, and NOT the 3x3 Sobel
 * Sobel gradient form).
 *
 * uv2 = uv + grad * (distortion/100) * 0.5: distortion scales the
 * self-warp strength; distortion = 0 collapses uv2 to uv exactly (grad's
 * contribution is multiplied to zero, not merely diminished).
 *
 * h2 = lum(blur at uv2): the height field re-read at the distorted sample
 * point - this second read (not the original h) is what feeds the tone
 * curve, so the "liquid" warp visibly displaces the metal bands relative to
 * the underlying image shape.
 *
 * cycles = mix(1.0, 7.0, detail/100): how many light/dark sine bands appear
 * per unit of height - Chrome's "Detail" slider.
 *
 * v = 0.5 + 0.5*sin(h2*cycles*2*PI + h2*3.0): an oscillating tone curve.
 * The extra `+ h2*3.0` phase term (on top of the `cycles` multiple-angle
 * term) breaks perfect periodicity slightly, so band spacing isn't a pure
 * repeating ramp - reads less mechanical, more liquid.
 *
 * v += pow(v, 8.0) * 0.5, then clamp to [0,1]: a narrow rim-specular boost
 * that only brightens the curve's own peaks (pow(v,8) is negligible except
 * where v is already close to 1), like a highlight catching a metal ridge.
 * v is always in [0,1] before this line (sin's range), so pow(v,8.0) never
 * sees a negative base.
 *
 * outColor = clamp(vec3(v) * vec3(0.96, 0.98, 1.02), 0, 1): grayscale only
 * (no source color anywhere in this pass) with a faint cool/blue tint
 * (channel gain rises R -> G -> B) for a steel/chrome cast instead of
 * neutral gray. Alpha comes from inputTex's src, not the blur.
 *
 * Y-orientation: h/h2 sample _chBlur (a same-effect prior-pass FBO) through
 * the standard per-backend native uv convention (gl_FragCoord.xy/resolution
 * in GLSL, pos.xy/texSize in WGSL) with NO manual Y compensation. This
 * same-effect intermediate read is orientation-transparent on both backends -
 * it matches on-screen presentation and matches inputTex, with no
 * mirroring. The sine tone curve is a pure function of height only - no
 * directional light, no rotation, nothing else fragment-coordinate-derived
 * - so it carries no Y-sensitivity of its own either. GLSL and WGSL are
 * therefore textually identical throughout, no compensation anywhere.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D blurTex;
uniform vec2 resolution;
uniform float detail;
uniform float distortion;

out vec4 fragColor;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texel = 1.0 / resolution;

    float hL = lum(texture(blurTex, uv - vec2(texel.x, 0.0)).rgb);
    float hR = lum(texture(blurTex, uv + vec2(texel.x, 0.0)).rgb);
    float hB = lum(texture(blurTex, uv - vec2(0.0, texel.y)).rgb);
    float hT = lum(texture(blurTex, uv + vec2(0.0, texel.y)).rgb);
    vec2 grad = vec2(hR - hL, hT - hB);

    vec2 uv2 = uv + grad * (distortion / 100.0) * 0.5;
    float h2 = lum(texture(blurTex, uv2).rgb);

    float cycles = mix(1.0, 7.0, detail / 100.0);
    float v = 0.5 + 0.5 * sin(h2 * cycles * 6.28318530718 + h2 * 3.0);
    v += pow(v, 8.0) * 0.5;
    v = clamp(v, 0.0, 1.0);

    vec3 outColor = clamp(vec3(v) * vec3(0.96, 0.98, 1.02), 0.0, 1.0);

    vec4 src = texture(inputTex, uv);
    fragColor = vec4(outColor, src.a);
}
