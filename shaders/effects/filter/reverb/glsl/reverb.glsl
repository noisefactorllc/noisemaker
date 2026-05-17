#version 300 es

precision highp float;
precision highp int;

// Reverb effect: blend input with multiple scaled-down versions of itself.
// Iterations control how many octaves of scaling are blended.

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform int iterations;
uniform bool ridges;
uniform float alpha;
uniform float wrap;

out vec4 fragColor;

vec2 applyWrap(vec2 uv) {
    int mode = int(wrap);
    if (mode == 0) {
        return abs(mod(uv + 1.0, 2.0) - 1.0);
    } else if (mode == 1) {
        return fract(uv);
    }
    return clamp(uv, 0.0, 1.0);
}

vec4 ridge_transform(vec4 color) {
    return vec4(1.0) - abs(color * 2.0 - vec4(1.0));
}

void main() {
    ivec2 dims = textureSize(inputTex, 0);
    
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 globalUV = globalCoord / fullResolution;
    vec2 localUV = gl_FragCoord.xy / vec2(dims);

    vec4 original = texture(inputTex, localUV);
    vec4 current = original;

    if (ridges) {
        current = ridge_transform(current);
    }

    vec4 accum = current;
    float totalWeight = 1.0;
    float weight = 0.5;
    float scale = 2.0;

    int iters = clamp(iterations, 1, 8);
    for (int i = 0; i < iters; i++) {
        vec2 warpedGlobalUV = globalUV * scale;
        vec2 wrappedGlobalUV = applyWrap(warpedGlobalUV);
        vec2 sampledLocalUV = fract((wrappedGlobalUV * fullResolution - tileOffset) / vec2(dims));
        
        vec4 scaled = texture(inputTex, sampledLocalUV);

        if (ridges) {
            scaled = ridge_transform(scaled);
        }

        accum += scaled * weight;
        totalWeight += weight;

        scale *= 2.0;
        weight *= 0.5;
    }

    vec4 result = accum / totalWeight;

    fragColor = vec4(mix(original.rgb, result.rgb, alpha), 1.0);
}