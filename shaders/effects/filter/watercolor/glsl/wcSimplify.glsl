/*
 * Watercolor - simplify pass: 3x3 median network (Devillard opt_med9, the
 * same 19-op compare-exchange sequence as filter/median's medianPass.glsl)
 * sampled at a pixel stride that widens as `detail` decreases -- a wider
 * stride pulls the 9 taps from farther apart, producing a coarser
 * simplification (bigger flattened washes); detail=100 samples the tight
 * 1px neighborhood (finest simplification). Executed twice per frame
 * (fixed `repeat: 2` in definition.js), ping-ponging the global_wc_state
 * surface exactly like filter/median's medianPass ping-pongs
 * global_median_state -- the second pass composes on top of the first
 * pass's already-simplified result.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float detail;

out vec4 fragColor;

void sort2(inout vec3 a, inout vec3 b) {
    vec3 lo = min(a, b);
    vec3 hi = max(a, b);
    a = lo;
    b = hi;
}

void main() {
    // detail=0 -> stride 3px (coarse); detail=100 -> stride 1px (fine).
    float stride = mix(3.0, 1.0, clamp(detail, 0.0, 100.0) / 100.0);
    vec2 texel = stride / resolution;
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 s0 = texture(inputTex, uv + vec2(-texel.x, -texel.y));
    vec4 s1 = texture(inputTex, uv + vec2(0.0, -texel.y));
    vec4 s2 = texture(inputTex, uv + vec2(texel.x, -texel.y));
    vec4 s3 = texture(inputTex, uv + vec2(-texel.x, 0.0));
    vec4 s4 = texture(inputTex, uv);
    vec4 s5 = texture(inputTex, uv + vec2(texel.x, 0.0));
    vec4 s6 = texture(inputTex, uv + vec2(-texel.x, texel.y));
    vec4 s7 = texture(inputTex, uv + vec2(0.0, texel.y));
    vec4 s8 = texture(inputTex, uv + vec2(texel.x, texel.y));

    vec3 p0 = s0.rgb; vec3 p1 = s1.rgb; vec3 p2 = s2.rgb;
    vec3 p3 = s3.rgb; vec3 p4 = s4.rgb; vec3 p5 = s5.rgb;
    vec3 p6 = s6.rgb; vec3 p7 = s7.rgb; vec3 p8 = s8.rgb;

    sort2(p1, p2); sort2(p4, p5); sort2(p7, p8);
    sort2(p0, p1); sort2(p3, p4); sort2(p6, p7);
    sort2(p1, p2); sort2(p4, p5); sort2(p7, p8);
    sort2(p0, p3); sort2(p5, p8); sort2(p4, p7);
    sort2(p3, p6); sort2(p1, p4); sort2(p2, p5);
    sort2(p4, p7); sort2(p4, p2); sort2(p6, p4);
    sort2(p4, p2);

    fragColor = vec4(p4, s4.a);
}
