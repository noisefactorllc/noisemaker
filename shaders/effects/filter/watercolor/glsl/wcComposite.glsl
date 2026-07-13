/*
 * Watercolor - composite pass: pigment pooling, paper granulation, warm
 * paper tint, and a flat-wash lift applied on top of the median-simplified
 * color washes (global_wc_state, produced by the seed + wcSimplify passes).
 *
 * edge = Sobel gradient luminance-gradient magnitude computed ON THE SIMPLIFIED texture
 * (not the original input), so pigment darkens along the boundaries of the
 * SIMPLIFIED regions -- the same region edges a real wash would pool
 * against -- rather than every high-frequency detail in the source.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D simplifiedTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float shadowIntensity;
uniform float paperTexture;

out vec4 fragColor;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Sobel gradient gradient, applied to the SIMPLIFIED texture (pigment pooling edges).
vec2 lumGradientSimplified(vec2 uv) {
    vec2 px = 1.0 / resolution;
    float tl = lum(texture(simplifiedTex, uv + px * vec2(-1.0,  1.0)).rgb);
    float  l = lum(texture(simplifiedTex, uv + px * vec2(-1.0,  0.0)).rgb);
    float bl = lum(texture(simplifiedTex, uv + px * vec2(-1.0, -1.0)).rgb);
    float tr = lum(texture(simplifiedTex, uv + px * vec2( 1.0,  1.0)).rgb);
    float  r = lum(texture(simplifiedTex, uv + px * vec2( 1.0,  0.0)).rgb);
    float br = lum(texture(simplifiedTex, uv + px * vec2( 1.0, -1.0)).rgb);
    float  t = lum(texture(simplifiedTex, uv + px * vec2( 0.0,  1.0)).rgb);
    float  b = lum(texture(simplifiedTex, uv + px * vec2( 0.0, -1.0)).rgb);
    return vec2(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 src = texture(inputTex, uv);
    vec3 simplified = texture(simplifiedTex, uv).rgb;

    float edge = length(lumGradientSimplified(uv));

    // Pigment pooling: darken along simplified-region boundaries, the way
    // watercolor pigment collects and dries darker at the edge of a wet wash.
    float pool = shadowIntensity / 100.0 * 0.7 * smoothstep(0.05, 0.4, edge);
    vec3 c = simplified * (1.0 - pool);

    // Paper granulation: hash/noise coordinate is the integer, tile-aware
    // global pixel index so the grain
    // aligns across GL/WGPU and across render tiles. Both the grain
    // strength and the warm paper tint are gated by paperTexture, so
    // paperTexture=0 yields a smooth, untinted wash and paperTexture=100
    // is full grain plus full tint.
    vec2 gc = floor(gl_FragCoord.xy) + tileOffset;
    c *= mix(1.0, 0.92 + 0.08 * vnoise(gc / 3.5), clamp(paperTexture, 0.0, 100.0) / 100.0);
    c = mix(c, c * vec3(1.02, 1.0, 0.95), paperTexture / 100.0);

    // Wash lift: on flat washes (edge near 0, i.e. far from any
    // pigment-pooled boundary) lift the color very slightly toward its own
    // luminance (desaturate) and brighten a touch, as if the pigment thinned
    // out there and let the white paper glow through -- the complement of
    // the pooling darkening above, strongest exactly where pooling is
    // weakest (same `edge` field, inverted falloff).
    float flatness = 1.0 - smoothstep(0.0, 0.15, edge);
    c = mix(c, vec3(lum(c)), flatness * 0.12);
    c *= 1.0 + flatness * 0.05;

    fragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
