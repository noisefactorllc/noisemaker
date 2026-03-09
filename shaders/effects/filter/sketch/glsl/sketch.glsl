/*
 * Sketch - Pencil sketch with crosshatch shading
 *
 * Converts input to luminance, applies contrast, detects edges via
 * derivative kernels, generates crosshatch patterns modulated by
 * darkness, applies vignette, and outputs grayscale sketch.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float contrast;
uniform float hatchDensity;
uniform float alpha;

out vec4 fragColor;

const float PI = 3.14159265358979;
const float SQRT_TWO = 1.4142135623730951;

float luminance(vec3 rgb) {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

float hash21(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

float triangleWave(float x) {
    float f = fract(x);
    return 1.0 - abs(f * 2.0 - 1.0);
}

vec2 rotate2d(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float hatchPattern(vec2 uv, float angle, float density, float phase) {
    vec2 rotated = rotate2d(uv - vec2(0.5), angle) + vec2(0.5);
    return triangleWave(rotated.x * density + phase);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texelSize = 1.0 / resolution;

    vec4 origColor = texture(inputTex, uv);

    // Convert to luminance and boost contrast
    float lum = luminance(origColor.rgb);
    lum = clamp((lum - 0.5) * contrast + 0.5, 0.0, 1.0);

    // --- Edge detection (derivative on luminance and inverted luminance) ---
    // Sample 3x3 neighborhood luminances
    float samples[9];
    vec2 offsets[9];
    offsets[0] = vec2(-1.0, -1.0);
    offsets[1] = vec2( 0.0, -1.0);
    offsets[2] = vec2( 1.0, -1.0);
    offsets[3] = vec2(-1.0,  0.0);
    offsets[4] = vec2( 0.0,  0.0);
    offsets[5] = vec2( 1.0,  0.0);
    offsets[6] = vec2(-1.0,  1.0);
    offsets[7] = vec2( 0.0,  1.0);
    offsets[8] = vec2( 1.0,  1.0);

    // Derivative kernels (simple forward difference, matching Python reference)
    float kx[9];
    kx[0]=0.0; kx[1]=0.0; kx[2]=0.0;
    kx[3]=0.0; kx[4]=1.0; kx[5]=-1.0;
    kx[6]=0.0; kx[7]=0.0; kx[8]=0.0;

    float ky[9];
    ky[0]=0.0; ky[1]=0.0; ky[2]=0.0;
    ky[3]=0.0; ky[4]=1.0; ky[5]=0.0;
    ky[6]=0.0; ky[7]=-1.0; ky[8]=0.0;

    for (int i = 0; i < 9; i++) {
        vec2 sampleUv = uv + offsets[i] * texelSize;
        float s = luminance(texture(inputTex, sampleUv).rgb);
        samples[i] = clamp((s - 0.5) * contrast + 0.5, 0.0, 1.0);
    }

    // Derivative on normal luminance
    float gx = 0.0, gy = 0.0;
    for (int i = 0; i < 9; i++) {
        gx += samples[i] * kx[i];
        gy += samples[i] * ky[i];
    }
    float grad = sqrt(gx * gx + gy * gy);

    // Derivative on inverted luminance
    float gxi = 0.0, gyi = 0.0;
    for (int i = 0; i < 9; i++) {
        float inv = 1.0 - samples[i];
        gxi += inv * kx[i];
        gyi += inv * ky[i];
    }
    float gradInv = sqrt(gxi * gxi + gyi * gyi);

    // Combine outlines: min of both, reduce contrast, normalize
    float outline = min(1.0 - grad, 1.0 - gradInv);
    outline = (outline - 0.5) * 0.25 + 0.5;  // adjust_contrast with 0.25
    outline = clamp(outline, 0.0, 1.0);

    // --- Vignette on luminance ---
    vec2 center = vec2(0.5);
    float dist = distance(uv, center);
    float maxDist = 0.5 * SQRT_TWO;
    float vigWeight = pow(clamp(dist / maxDist, 0.0, 1.0), 2.0);
    float vigLum = mix(lum, mix(lum, 1.0, vigWeight), 0.875);

    // --- Crosshatch ---
    float darkness = clamp(1.0 - vigLum, 0.0, 1.0);
    float densityBase = mix(32.0, 220.0, pow(darkness, 0.85)) * hatchDensity;

    // Noise seed for texture variation
    vec2 noiseSeed = uv * resolution * 0.5;
    float jitter = hash21(noiseSeed);

    float p0 = hatchPattern(uv, 0.0, densityBase, jitter * 2.0);
    float p1 = hatchPattern(uv, PI * 0.25, densityBase * 0.85, jitter * 1.3);
    float p2 = hatchPattern(uv, -PI * 0.25, densityBase * 0.9, jitter * 3.7);

    float hatch = min(p0, min(p1, p2));
    float texNoise = hash21(noiseSeed * 1.75);
    float modulated = mix(hatch, texNoise, 0.25);
    float attenuated = mix(1.0, modulated, clamp(pow(darkness, 1.4), 0.0, 1.0));
    float crosshatch = clamp(1.0 - attenuated, 0.0, 1.0);

    // --- Combine ---
    float blended = mix(crosshatch, outline, 0.75);

    // Subtle warp
    float warpA = hash21(uv * resolution * 0.125);
    float warpB = hash21(uv * resolution * 0.125 * 1.37 + vec2(0.19, 0.0));
    blended = clamp(blended + (warpA - warpB) * 0.0025, 0.0, 1.0);

    // Darken
    float combined = blended * blended;

    // Blend with original using alpha
    vec3 sketchColor = vec3(combined);
    vec3 result = mix(origColor.rgb, sketchColor, alpha);

    fragColor = vec4(result, origColor.a);
}
