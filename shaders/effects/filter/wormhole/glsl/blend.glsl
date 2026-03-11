#version 300 es
precision highp float;

// Wormhole Blend
// JS: normalize(out) across RGB only -> sqrt -> blend(tensor, out, alpha)

uniform sampler2D inputTex;
uniform sampler2D accumTex;
uniform vec2 resolution;
uniform float alpha;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 src = texture(inputTex, uv);
    vec4 accum = texture(accumTex, uv);

    // JS: find single global min/max across all RGB values
    // GPU approximation: sample 64x64 grid (4096 samples)
    float minVal = 1e10;
    float maxVal = -1e10;
    for (int gy = 0; gy < 64; gy++) {
        for (int gx = 0; gx < 64; gx++) {
            vec2 sampleUV = (vec2(float(gx), float(gy)) + 0.5) / 64.0;
            vec4 s = texture(accumTex, sampleUV);
            minVal = min(minVal, min(min(s.r, s.g), s.b));
            maxVal = max(maxVal, max(max(s.r, s.g), s.b));
        }
    }

    // JS: (out[i] - min) / (max - min)
    float range = maxVal - minVal;
    vec3 normalized;
    if (range > 0.0) {
        normalized = (accum.rgb - minVal) / range;
    } else {
        normalized = accum.rgb;
    }

    // JS: out[i] = Math.sqrt(out[i])
    vec3 sqrtVal = sqrt(max(normalized, vec3(0.0)));

    // JS: blend(tensor, outTensor, alpha) — RGB only, preserve original alpha
    fragColor = vec4(mix(src.rgb, sqrtVal, alpha), src.a);
}
