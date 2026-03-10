/*
 * Clouds - Cloud texture overlay
 *
 * Ridged multi-octave 2D simplex noise shaped into clouds,
 * composited with offset shadow onto the input.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float seed;
uniform float scale;

out vec4 fragColor;

// Simplex 2D - MIT License (Ashima Arts)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float simplex2d(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);

    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;

    return 130.0 * dot(m, g);
}

// Multi-octave FBM simplex noise, returns [0, 1]
float cloudNoise(vec2 uv, float baseFreq, int octaves) {
    float accum = 0.0;
    float totalAmp = 0.0;

    for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        float freq = baseFreq * pow(2.0, float(i));
        float amp = 1.0 / pow(2.0, float(i));

        float n = simplex2d(uv * freq + vec2(float(i) * 37.0, float(i) * 53.0));
        // Map [-1,1] to [0,1]
        n = n * 0.5 + 0.5;

        accum += n * amp;
        totalAmp += amp;
    }

    return accum / totalAmp;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 inputColor = texture(inputTex, uv);

    // Scale UV for cloud size, aspect-correct, offset by seed
    float aspect = resolution.x / resolution.y;
    vec2 cloudUV = uv * vec2(aspect, 1.0) / scale + vec2(seed * 17.31, seed * 23.71);

    float cloud = cloudNoise(cloudUV, 1.0, 7);

    // Shape into clouds: threshold for puffy shapes
    float cloudMask = smoothstep(0.45, 0.65, cloud);

    // Cloud shading: vary brightness within the cloud for depth
    // Thicker parts (higher noise) are brighter white, edges are slightly gray
    float cloudDepth = smoothstep(0.45, 0.85, cloud);
    float cloudBrightness = mix(0.75, 1.0, cloudDepth);

    // Shadow: sample cloud at offset (light from upper-right)
    float shadowDist = min(resolution.x, resolution.y) * 0.008;
    vec2 shadowOffset = vec2(-shadowDist, shadowDist) / resolution;
    vec2 shadowUV = (uv + shadowOffset) * vec2(aspect, 1.0) / scale + vec2(seed * 17.31, seed * 23.71);
    float shadowCloud = cloudNoise(shadowUV, 1.0, 7);
    float shadowMask = smoothstep(0.45, 0.65, shadowCloud);

    // Shadow only where there's cloud nearby but not at current pixel
    float shadow = max(shadowMask - cloudMask, 0.0) * 0.5;

    // Composite: darken input by shadow, then overlay shaded clouds
    vec3 result = inputColor.rgb * (1.0 - shadow);
    result = mix(result, vec3(cloudBrightness), cloudMask);

    fragColor = vec4(result, inputColor.a);
}
