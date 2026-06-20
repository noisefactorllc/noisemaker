/*
 * Mashup — GLSL fragment shader
 *
 * Posterize the control input (source) by luminance into `layers` equal
 * bands and route each band to its layerN_tex source. Darkest band ->
 * layer0, brightest -> layer(layers-1). `smoothness` feathers each band
 * boundary (0 = hard posterized edges). Bands whose layer source is unwired
 * (layerN_active == 0) fall back to the control input.
 */

#ifdef GL_ES
precision highp float;
#endif

#define MAX_LAYERS 8

// Auto-filled by the runtime — output framebuffer dimensions. Needed because
// this is a starter effect with no chain input to size from.
uniform vec2 resolution;

// Control input: its luminance selects the band. Wire with `source: read(oN)`.
uniform sampler2D source;

uniform sampler2D layer0_tex;
uniform sampler2D layer1_tex;
uniform sampler2D layer2_tex;
uniform sampler2D layer3_tex;
uniform sampler2D layer4_tex;
uniform sampler2D layer5_tex;
uniform sampler2D layer6_tex;
uniform sampler2D layer7_tex;

uniform int layers;
uniform float smoothness;

uniform int layer0_active; uniform int layer1_active; uniform int layer2_active; uniform int layer3_active;
uniform int layer4_active; uniform int layer5_active; uniform int layer6_active; uniform int layer7_active;

out vec4 fragColor;

// RGB -> luminosity (shared codebase weights).
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

vec4 sampleLayer(int i, vec2 uv) {
    if (i == 0) return texture(layer0_tex, uv);
    if (i == 1) return texture(layer1_tex, uv);
    if (i == 2) return texture(layer2_tex, uv);
    if (i == 3) return texture(layer3_tex, uv);
    if (i == 4) return texture(layer4_tex, uv);
    if (i == 5) return texture(layer5_tex, uv);
    if (i == 6) return texture(layer6_tex, uv);
    return texture(layer7_tex, uv);
}

int layerActive(int i) {
    if (i == 0) return layer0_active;
    if (i == 1) return layer1_active;
    if (i == 2) return layer2_active;
    if (i == 3) return layer3_active;
    if (i == 4) return layer4_active;
    if (i == 5) return layer5_active;
    if (i == 6) return layer6_active;
    return layer7_active;
}

// Band-boundary weight: 0 below the boundary, 1 above, with a symmetric
// smoothstep feather of half-width `smoothness`. smoothness <= 0 is a hard step.
float bandWeight(float lum, float boundary) {
    if (smoothness <= 0.0) return step(boundary, lum);
    return smoothstep(boundary - smoothness, boundary + smoothness, lum);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 controlColor = texture(source, uv);
    float lum = getLuminosity(controlColor.rgb);

    int n = clamp(layers, 2, MAX_LAYERS);

    // Base = darkest band's source (or the control input when unwired).
    vec4 result = (layerActive(0) == 1) ? sampleLayer(0, uv) : controlColor;

    // Each subsequent boundary at k/n cross-fades toward that band's source.
    for (int k = 1; k < MAX_LAYERS; k++) {
        if (k >= n) break;
        vec4 src = (layerActive(k) == 1) ? sampleLayer(k, uv) : controlColor;
        float boundary = float(k) / float(n);
        float w = bandWeight(lum, boundary);
        result = mix(result, src, w);
    }

    fragColor = result;
}
