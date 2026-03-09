#version 300 es

precision highp float;
precision highp int;

// Wormhole - luminance-driven displacement field
// Gather adaptation of Python scatter_nd wormhole

uniform sampler2D inputTex;
uniform float time;
uniform float kink;
uniform float stride;
uniform float alpha;
uniform float speed;

in vec2 v_texCoord;
out vec4 fragColor;

const float TAU = 6.28318530717959;

float luminance(vec4 color) {
    return dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 dims = vec2(textureSize(inputTex, 0));

    // Get source pixel
    vec4 src = texture(inputTex, v_texCoord);
    float lum = luminance(src);

    // Luminance to angle (Python: values * tau * kink)
    float angle = lum * TAU * kink;

    // Displacement in UV space (Python: (cos/sin + 1) * 1024 * input_stride)
    // Scale stride so default 1.0 produces strong displacement
    float s = stride * 0.25;
    float offsetX = (cos(angle) + 1.0) * s;
    float offsetY = (sin(angle) + 1.0) * s;

    // Sample from offset position (gather instead of scatter)
    vec2 sampleCoord = fract(v_texCoord + vec2(offsetX, offsetY));
    vec4 sampled = texture(inputTex, sampleCoord);

    // Weight by luminance squared (Python: square(values))
    float weight = lum * lum;
    vec4 warped = sampled * weight;

    // Blend with original (Python: blend(tensor, sqrt(out), alpha))
    fragColor = mix(src, sqrt(warped), alpha);
}
