#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float blend;
uniform float repeat;
uniform int curve;

out vec4 fragColor;

/*
 * Blend weight function.
 * For a coordinate t in [0, 1], returns how much to blend
 * toward the wrapped sample. Weight is 1 at edges, 0 in center.
 */
float edgeWeight(float t, float width) {
    if (width <= 0.0) return 0.0;
    // Distance from nearest edge (0 at edge, 0.5 at center)
    float d = min(t, 1.0 - t);
    float w = 1.0 - clamp(d / width, 0.0, 1.0);
    // Apply curve
    if (curve == 0) {
        return w; // linear
    } else if (curve == 2) {
        return w * w; // sharp (quadratic)
    }
    return w * w * (3.0 - 2.0 * w); // smoothstep (default)
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    // Apply tiling repetition
    vec2 st = uv * repeat;
    st = fract(st);

    // Compute blend weights for x and y edges
    float wx = edgeWeight(st.x, blend);
    float wy = edgeWeight(st.y, blend);

    // Sample original and three wrapped positions
    vec4 c00 = texture(inputTex, st);
    vec4 c10 = texture(inputTex, fract(st + vec2(0.5, 0.0)));
    vec4 c01 = texture(inputTex, fract(st + vec2(0.0, 0.5)));
    vec4 c11 = texture(inputTex, fract(st + vec2(0.5, 0.5)));

    // Bilinear blend using edge weights
    vec4 mx0 = mix(c00, c10, wx);
    vec4 mx1 = mix(c01, c11, wx);
    vec4 result = mix(mx0, mx1, wy);

    fragColor = vec4(result.rgb, 1.0);
}
