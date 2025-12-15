#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float time;
uniform int paletteIndex;
uniform float alpha;

out vec4 fragColor;

struct PaletteEntry {
    vec4 amp;
    vec4 freq;
    vec4 offset;
    vec4 phase;
};

const int PALETTE_COUNT = 55;
const PaletteEntry PALETTES[PALETTE_COUNT] = PaletteEntry[PALETTE_COUNT](
    // 1: 1970s shirt
    PaletteEntry(
        vec4(0.76, 0.88, 0.37, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.93, 0.97, 0.52, 0.0),
        vec4(0.21, 0.41, 0.56, 0.0)
    ),
    // 2: fiveG
    PaletteEntry(
        vec4(0.56851584, 0.7740668, 0.23485267, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.727029, 0.08039695, 0.10427457, 0.0)
    ),
    // 3: afterimage
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.3, 0.2, 0.2, 0.0)
    ),
    // 4: barstow
    PaletteEntry(
        vec4(0.45, 0.2, 0.1, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.7, 0.2, 0.2, 0.0),
        vec4(0.5, 0.4, 0, 0.0)
    ),
    // 5: bloob
    PaletteEntry(
        vec4(0.09, 0.59, 0.48, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.2, 0.31, 0.98, 0.0),
        vec4(0.88, 0.4, 0.33, 0.0)
    ),
    // 6: blue skies
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.1, 0.4, 0.7, 0.0),
        vec4(0.1, 0.1, 0.1, 0.0)
    ),
    // 7: brushed metal
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0, 0.1, 0.2, 0.0)
    ),
    // 8: burning sky
    PaletteEntry(
        vec4(0.7259015, 0.7004237, 0.9494409, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.63290054, 0.37883538, 0.29405284, 0.0),
        vec4(0, 0.1, 0.2, 0.0)
    ),
    // 9: california
    PaletteEntry(
        vec4(0.94, 0.33, 0.27, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.74, 0.37, 0.73, 0.0),
        vec4(0.44, 0.17, 0.88, 0.0)
    ),
    // 10: columbia
    PaletteEntry(
        vec4(1, 0.7, 1, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(1, 0.4, 0.9, 0.0),
        vec4(0.4, 0.5, 0.6, 0.0)
    ),
    // 11: cotton candy
    PaletteEntry(
        vec4(0.51, 0.39, 0.41, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.59, 0.53, 0.94, 0.0),
        vec4(0.15, 0.41, 0.46, 0.0)
    ),
    // 12: dark satin
    PaletteEntry(
        vec4(0, 0, 0.51, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0, 0, 0.43, 0.0),
        vec4(0, 0, 0.36, 0.0)
    ),
    // 13: dealer hat
    PaletteEntry(
        vec4(0.83, 0.45, 0.19, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.79, 0.45, 0.35, 0.0),
        vec4(0.28, 0.91, 0.61, 0.0)
    ),
    // 14: dreamy
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0, 0.2, 0.25, 0.0)
    ),
    // 15: event horizon
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.22, 0.48, 0.62, 0.0),
        vec4(0.1, 0.3, 0.2, 0.0)
    ),
    // 16: ghostly
    PaletteEntry(
        vec4(0.02, 0.92, 0.76, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.51, 0.49, 0.51, 0.0),
        vec4(0.71, 0.23, 0.66, 0.0)
    ),
    // 17: grayscale
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(2, 2, 2, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0)
    ),
    // 18: hazy sunset
    PaletteEntry(
        vec4(0.79, 0.56, 0.22, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.96, 0.5, 0.49, 0.0),
        vec4(0.15, 0.98, 0.87, 0.0)
    ),
    // 19: heatmap
    PaletteEntry(
        vec4(0.75804377, 0.62868536, 0.2227562, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.35536355, 0.12935615, 0.17060602, 0.0),
        vec4(0, 0.25, 0.5, 0.0)
    ),
    // 20: hypercolor
    PaletteEntry(
        vec4(0.79, 0.5, 0.23, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.75, 0.47, 0.45, 0.0),
        vec4(0.08, 0.84, 0.16, 0.0)
    ),
    // 21: jester
    PaletteEntry(
        vec4(0.7, 0.81, 0.73, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.1, 0.22, 0.27, 0.0),
        vec4(0.99, 0.12, 0.94, 0.0)
    ),
    // 22: just blue
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0, 0, 1, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0)
    ),
    // 23: just cyan
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0, 1, 1, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0)
    ),
    // 24: just green
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0, 1, 0, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0)
    ),
    // 25: just purple
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 0, 1, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0)
    ),
    // 26: just red
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 0, 0, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0)
    ),
    // 27: just yellow
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 0, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0)
    ),
    // 28: mars
    PaletteEntry(
        vec4(0.74, 0.33, 0.09, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.62, 0.2, 0.2, 0.0),
        vec4(0.2, 0.1, 0, 0.0)
    ),
    // 29: modesto
    PaletteEntry(
        vec4(0.56, 0.68, 0.39, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.72, 0.07, 0.62, 0.0),
        vec4(0.25, 0.4, 0.41, 0.0)
    ),
    // 30: moss
    PaletteEntry(
        vec4(0.78, 0.39, 0.07, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0, 0.53, 0.33, 0.0),
        vec4(0.94, 0.92, 0.9, 0.0)
    ),
    // 31: neptune
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.2, 0.64, 0.62, 0.0),
        vec4(0.15, 0.2, 0.3, 0.0)
    ),
    // 32: net of gems
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.64, 0.12, 0.84, 0.0),
        vec4(0.1, 0.25, 0.15, 0.0)
    ),
    // 33: organic
    PaletteEntry(
        vec4(0.42, 0.42, 0.04, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.47, 0.27, 0.27, 0.0),
        vec4(0.41, 0.14, 0.11, 0.0)
    ),
    // 34: papaya
    PaletteEntry(
        vec4(0.65, 0.4, 0.11, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.72, 0.45, 0.08, 0.0),
        vec4(0.71, 0.8, 0.84, 0.0)
    ),
    // 35: radioactive
    PaletteEntry(
        vec4(0.62, 0.79, 0.11, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.22, 0.56, 0.17, 0.0),
        vec4(0.15, 0.1, 0.25, 0.0)
    ),
    // 36: royal
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.41, 0.22, 0.67, 0.0),
        vec4(0.2, 0.25, 0.2, 0.0)
    ),
    // 37: santa cruz
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0.25, 0.5, 0.75, 0.0)
    ),
    // 38: sherbet
    PaletteEntry(
        vec4(0.6059281, 0.17591387, 0.17166573, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.5224456, 0.3864609, 0.36020845, 0.0),
        vec4(0, 0.25, 0.5, 0.0)
    ),
    // 39: sherbet double
    PaletteEntry(
        vec4(0.6059281, 0.17591387, 0.17166573, 0.0),
        vec4(2, 2, 2, 0.0),
        vec4(0.5224456, 0.3864609, 0.36020845, 0.0),
        vec4(0, 0.25, 0.5, 0.0)
    ),
    // 40: silvermane
    PaletteEntry(
        vec4(0.42, 0, 0, 0.0),
        vec4(2, 2, 2, 0.0),
        vec4(0.45, 0.5, 0.42, 0.0),
        vec4(0.63, 1, 1, 0.0)
    ),
    // 41: skykissed
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.83, 0.6, 0.63, 0.0),
        vec4(0.3, 0.1, 0, 0.0)
    ),
    // 42: solaris
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.6, 0.4, 0.1, 0.0),
        vec4(0.3, 0.2, 0.1, 0.0)
    ),
    // 43: spooky
    PaletteEntry(
        vec4(0.46, 0.73, 0.19, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.27, 0.79, 0.78, 0.0),
        vec4(0.27, 0.16, 0.04, 0.0)
    ),
    // 44: springtime
    PaletteEntry(
        vec4(0.67, 0.25, 0.27, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.74, 0.48, 0.46, 0.0),
        vec4(0.07, 0.79, 0.39, 0.0)
    ),
    // 45: sproingtime
    PaletteEntry(
        vec4(0.9, 0.43, 0.34, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.56, 0.69, 0.32, 0.0),
        vec4(0.03, 0.8, 0.4, 0.0)
    ),
    // 46: sulphur
    PaletteEntry(
        vec4(0.73, 0.36, 0.52, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.78, 0.68, 0.15, 0.0),
        vec4(0.74, 0.93, 0.28, 0.0)
    ),
    // 47: summoning
    PaletteEntry(
        vec4(1, 0, 0.8, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0, 0, 0, 0.0),
        vec4(0, 0.5, 0.1, 0.0)
    ),
    // 48: superhero
    PaletteEntry(
        vec4(1, 0.25, 0.5, 0.0),
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(0, 0, 0.25, 0.0),
        vec4(0.5, 0, 0, 0.0)
    ),
    // 49: toxic
    PaletteEntry(
        vec4(0.5, 0.5, 0.5, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.26, 0.57, 0.03, 0.0),
        vec4(0, 0.1, 0.3, 0.0)
    ),
    // 50: tropicalia
    PaletteEntry(
        vec4(0.28, 0.08, 0.65, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.48, 0.6, 0.03, 0.0),
        vec4(0.1, 0.15, 0.3, 0.0)
    ),
    // 51: tungsten
    PaletteEntry(
        vec4(0.65, 0.93, 0.73, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.31, 0.21, 0.27, 0.0),
        vec4(0.43, 0.45, 0.48, 0.0)
    ),
    // 52: vaporwave
    PaletteEntry(
        vec4(0.9, 0.76, 0.63, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0, 0.19, 0.68, 0.0),
        vec4(0.43, 0.23, 0.32, 0.0)
    ),
    // 53: vibrant
    PaletteEntry(
        vec4(0.78, 0.63, 0.68, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.41, 0.03, 0.16, 0.0),
        vec4(0.81, 0.61, 0.06, 0.0)
    ),
    // 54: vintage
    PaletteEntry(
        vec4(0.97, 0.74, 0.23, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.97, 0.38, 0.35, 0.0),
        vec4(0.34, 0.41, 0.44, 0.0)
    ),
    // 55: vintage photo
    PaletteEntry(
        vec4(0.68, 0.79, 0.57, 0.0),
        vec4(1, 1, 1, 0.0),
        vec4(0.56, 0.35, 0.14, 0.0),
        vec4(0.73, 0.9, 0.99, 0.0)
    )
);

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

float srgb_to_lin(float value) {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

float oklab_l_component(vec3 rgb) {
    float r_lin = srgb_to_lin(rgb.x);
    float g_lin = srgb_to_lin(rgb.y);
    float b_lin = srgb_to_lin(rgb.z);

    float l_val = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    float m_val = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    float s_val = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;

    float l_cbrt = pow(l_val, 1.0 / 3.0);
    float m_cbrt = pow(m_val, 1.0 / 3.0);
    float s_cbrt = pow(s_val, 1.0 / 3.0);

    return 0.2104542553 * l_cbrt + 0.7936177850 * m_cbrt - 0.0040720468 * s_cbrt;
}

float cosine_blend_weight(float blend) {
    return (1.0 - cos(blend * PI)) * 0.5;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 texel = texture(inputTex, uv);

    if (paletteIndex == 0) {
        fragColor = texel;
        return;
    }

    int clamped_index = clamp(paletteIndex - 1, 0, PALETTE_COUNT - 1);
    PaletteEntry palette = PALETTES[clamped_index];

    vec3 base_rgb = clamp(texel.rgb, 0.0, 1.0);
    float lightness = oklab_l_component(base_rgb);

    vec3 freq_vec = palette.freq.xyz;
    vec3 amp_vec = palette.amp.xyz;
    vec3 offset_vec = palette.offset.xyz;
    vec3 phase_vec = palette.phase.xyz;

    vec3 cosine_arg = freq_vec * (lightness + time) + phase_vec;
    vec3 cosine_vals = cos(TAU * cosine_arg);
    vec3 palette_rgb = offset_vec + amp_vec * cosine_vals;

    float weight = cosine_blend_weight(alpha);
    vec3 blended = mix(base_rgb, palette_rgb, weight);
    
    fragColor = vec4(blended, texel.a);
}
