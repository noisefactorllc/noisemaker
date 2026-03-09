/*
 * Spatter: Multi-layer procedural paint spatter effect.
 * Low-freq warped noise for large splatter shapes, medium-freq dots,
 * high-freq specks, minus ridged noise for breaks.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform vec3 color;
uniform float density;
uniform float alpha;
uniform int seed;

out vec4 fragColor;

float hash21(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

float hash31(vec3 p) {
    float h = dot(p, vec3(127.1, 311.7, 74.7));
    return fract(sin(h) * 43758.5453123);
}

float fade(float t) {
    return t * t * (3.0 - 2.0 * t);
}

float value_noise(vec2 p, float s) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float tl = hash31(vec3(cell, s));
    float tr = hash31(vec3(cell + vec2(1.0, 0.0), s));
    float bl = hash31(vec3(cell + vec2(0.0, 1.0), s));
    float br = hash31(vec3(cell + vec2(1.0, 1.0), s));
    vec2 st = vec2(fade(f.x), fade(f.y));
    return mix(mix(tl, tr, st.x), mix(bl, br, st.x), st.y);
}

float fbm(vec2 uv, vec2 freq, int octaves, float s) {
    float amp = 0.5;
    float accum = 0.0;
    float weight = 0.0;
    vec2 f = freq;
    for (int i = 0; i < octaves; i++) {
        float os = s + float(i) * 37.17;
        accum += pow(value_noise(uv * f, os), 4.0) * amp;
        weight += amp;
        f *= 2.0;
        amp *= 0.5;
    }
    return weight > 0.0 ? clamp(accum / weight, 0.0, 1.0) : 0.0;
}

void main() {
    ivec2 dims = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(dims);
    vec4 base = texture(inputTex, uv);

    float s = float(seed) * 17.3;
    float aspect = float(dims.x) / float(dims.y);

    // Layer 1: Low-freq warped noise for large splatter shapes
    float smearFreq = mix(3.0, 6.0, hash21(vec2(s + 3.0, s + 29.0)));
    vec2 smearF = vec2(smearFreq, smearFreq * aspect);
    float smear0 = fbm(uv, smearF, 6, s + 23.0);

    // Self-warp: offset UV by noise value, re-sample
    float warpAmt = 0.08 * density;
    vec2 warpedUV = uv + (smear0 - 0.5) * warpAmt;
    float smear = fbm(warpedUV, smearF, 6, s + 23.0);

    // Layer 2: Medium-freq spatter dots (32-64), threshold for sparse dots
    float dotFreq = mix(32.0, 64.0, hash21(vec2(s + 5.0, s + 59.0)));
    vec2 dotF = vec2(dotFreq, dotFreq * aspect);
    float dots = fbm(uv, dotF, 4, s + 43.0);
    dots = smoothstep(0.6 - density * 0.3, 0.8, dots);

    // Layer 3: High-freq fine specks (150-200)
    float speckFreq = mix(150.0, 200.0, hash21(vec2(s + 13.0, s + 97.0)));
    vec2 speckF = vec2(speckFreq, speckFreq * aspect);
    float specks = fbm(uv, speckF, 4, s + 71.0);
    specks = smoothstep(0.6 - density * 0.2, 0.85, specks);

    // Subtract ridged noise to create breaks
    float ridgeFreq = mix(2.0, 3.0, hash21(vec2(s + 31.0, s + 149.0)));
    vec2 ridgeF = vec2(ridgeFreq, ridgeFreq * aspect);
    float ridgeNoise = fbm(uv, ridgeF, 3, s + 89.0);
    float ridgeMask = abs(ridgeNoise * 2.0 - 1.0);

    // Combine layers
    float combined = max(smear, max(dots, specks));
    float mask = max(combined - ridgeMask, 0.0);
    mask = clamp(mask * (0.5 + density), 0.0, 1.0);

    // Color: mix spatter color with input, weighted by mask
    vec3 colored = mix(base.rgb, color, mask);
    vec3 result = mix(base.rgb, colored, mask * alpha);

    fragColor = vec4(result, base.a);
}
