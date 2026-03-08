#version 300 es

precision highp float;
precision highp int;

// Ridge effect.
// Parameterized ridge transform with configurable midpoint level.

uniform sampler2D inputTex;
uniform float level;

out vec4 fragColor;

vec4 ridge_transform(vec4 value, float lvl) {
    float denom = max(lvl, 1.0 - lvl);
    vec4 result = vec4(1.0) - abs(value - vec4(lvl)) / denom;
    return clamp(result, vec4(0.0), vec4(1.0));
}

void main() {
    ivec2 dims = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(dims);

    vec4 texel = texture(inputTex, uv);

    // Apply ridge transform
    vec4 ridged = ridge_transform(texel, level);
    vec4 out_color = vec4(ridged.xyz, 1.0);

    fragColor = out_color;
}
