/*
 * Spatter: Multi-layer procedural paint spatter effect.
 * Large warped smears, medium dots, fine specks, minus ridged breaks.
 * Matches Python reference: exp-distributed noise with aggressive thresholding.
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

// PCG PRNG
uvec3 pcg3(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

uint pcg(uint v) {
    return pcg3(uvec3(v, 0u, 0u)).x;
}

float hashf(uint h) {
    return float(pcg3(uvec3(h, 0u, 0u)).x) / float(0xffffffffu);
}

float hash31(vec3 p) {
    uvec3 v = uvec3(
        uint(p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0),
        uint(p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0),
        uint(p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0)
    );
    return float(pcg3(v).x) / float(0xffffffffu);
}

float fade(float t) {
    return t * t * (3.0 - 2.0 * t);
}

float vnoise(vec2 p, float s) {
    vec2 c = floor(p);
    vec2 f = fract(p);
    vec2 u = vec2(fade(f.x), fade(f.y));
    return mix(
        mix(hash31(vec3(c, s)), hash31(vec3(c + vec2(1, 0), s)), u.x),
        mix(hash31(vec3(c + vec2(0, 1), s)), hash31(vec3(c + vec2(1, 1), s)), u.x),
        u.y);
}

// 3-octave exp FBM — fixed loop count for fast compilation
float expFbm3(vec2 uv, vec2 freq, float s) {
    float a = 0.0;
    a += pow(vnoise(uv * freq, s), 4.0) * 0.5;
    a += pow(vnoise(uv * freq * 2.0, s + 37.17), 4.0) * 0.25;
    a += pow(vnoise(uv * freq * 4.0, s + 74.34), 4.0) * 0.125;
    return a;
}

// 2-octave exp FBM
float expFbm2(vec2 uv, vec2 freq, float s) {
    float a = 0.0;
    a += pow(vnoise(uv * freq, s), 4.0) * 0.5;
    a += pow(vnoise(uv * freq * 2.0, s + 37.17), 4.0) * 0.25;
    return a;
}

// 2-octave ridged FBM
float ridgedFbm2(vec2 uv, vec2 freq, float s) {
    float a = 0.0;
    float n0 = vnoise(uv * freq, s);
    a += pow(abs(n0 * 2.0 - 1.0), 4.0) * 0.5;
    float n1 = vnoise(uv * freq * 2.0, s + 37.17);
    a += pow(abs(n1 * 2.0 - 1.0), 4.0) * 0.25;
    return a / 0.75;
}

void main() {
    ivec2 dims = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(dims);
    vec4 base = texture(inputTex, uv);

    float s = float(seed) * 17.3;

    // Seed-derived random frequencies
    float smearFreq = mix(3.0, 6.0, hashf(pcg(uint(s + 10.0))));
    float dotFreq = mix(24.0, 48.0, hashf(pcg(uint(s + 50.0))));
    float speckFreq = mix(64.0, 96.0, hashf(pcg(uint(s + 90.0))));
    float ridgeFreq = mix(2.0, 3.0, hashf(pcg(uint(s + 130.0))));

    // -- Layer 1: Large smear (low-freq domain-warped noise) --
    float warpX = vnoise(uv * vec2(2.0, 1.0), s + 200.0);
    float warpY = vnoise(uv * vec2(3.0, 2.0), s + 300.0);
    float disp = 1.0 + hashf(pcg(uint(s + 150.0)));
    vec2 warpedUV = uv + (vec2(warpX, warpY) - 0.5) * disp * 0.12;
    float smear = expFbm3(warpedUV, vec2(smearFreq), s + 100.0);
    smear = clamp(smear * 5.0, 0.0, 1.0);

    // -- Layer 2: Medium dots --
    float dots = expFbm2(uv, vec2(dotFreq), s + 43.0);
    dots = clamp((dots - 0.08) * 8.0, 0.0, 1.0);

    // -- Layer 3: Fine specks --
    float specks = expFbm2(uv, vec2(speckFreq), s + 71.0);
    specks = clamp((specks - 0.06) * 10.0, 0.0, 1.0);

    // Combine: max of layers (Python uses tf.maximum)
    float combined = max(smear, max(dots, specks));

    // Subtract ridged noise for breaks
    float ridge = ridgedFbm2(uv, vec2(ridgeFreq), s + 89.0);
    combined = max(0.0, combined - ridge);

    // Density controls overall amount
    combined *= (0.1 + density * 1.6);

    // Hard threshold blend (Python blend_layers with 0.005 threshold)
    float mask = step(0.005, combined) * clamp(combined, 0.0, 1.0);

    // Color: where mask > 0, show color * input; else show input
    vec3 colored = mix(base.rgb, base.rgb * color, mask);
    vec3 result = mix(base.rgb, colored, alpha);

    fragColor = vec4(result, base.a);
}
