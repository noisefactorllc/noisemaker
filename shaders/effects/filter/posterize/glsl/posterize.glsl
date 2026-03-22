/*
 * Posterize: sRGB-aware color quantization with adjustable gamma
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float levels;
uniform float gamma;
uniform bool antialias;

out vec4 fragColor;

const float MIN_LEVELS = 1.0;
const float MIN_GAMMA = 1e-3;

float clamp_01(float value) {
    return clamp(value, 0.0, 1.0);
}

float srgb_to_linear_component(float value) {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

float linear_to_srgb_component(float value) {
    if (value <= 0.0031308) {
        return value * 12.92;
    }
    return 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}

vec3 srgb_to_linear_rgb(vec3 rgb) {
    return vec3(
        srgb_to_linear_component(rgb.x),
        srgb_to_linear_component(rgb.y),
        srgb_to_linear_component(rgb.z)
    );
}

vec3 linear_to_srgb_rgb(vec3 rgb) {
    return vec3(
        linear_to_srgb_component(rgb.x),
        linear_to_srgb_component(rgb.y),
        linear_to_srgb_component(rgb.z)
    );
}

vec3 pow_vec3(vec3 value, float exponent) {
    return vec3(
        pow(value.x, exponent),
        pow(value.y, exponent),
        pow(value.z, exponent)
    );
}

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(inputTex, 0));
    vec4 texel = texture(inputTex, uv);

    float levels_raw = max(levels, 0.0);
    float levels_quantized = max(round(levels_raw), MIN_LEVELS);
    if (levels_quantized <= 1.0) {
        fragColor = texel;
        return;
    }

    float level_factor = levels_quantized;
    float inv_factor = 1.0 / level_factor;
    float half_step = inv_factor * 0.5;
    float gamma_value = max(gamma, MIN_GAMMA);
    float inv_gamma = 1.0 / gamma_value;

    vec3 working_rgb = srgb_to_linear_rgb(texel.xyz);
    working_rgb = pow_vec3(clamp(working_rgb, vec3(0.0), vec3(1.0)), gamma_value);

    // Posterize with optional edge smoothing
    vec3 scaled = working_rgb * level_factor + vec3(half_step);
    vec3 quantized_rgb;
    if (antialias) {
        vec3 f = fract(scaled);
        vec3 fw = fwidth(scaled);
        vec3 blend = smoothstep(0.5 - fw * 0.5, 0.5 + fw * 0.5, f);
        quantized_rgb = (floor(scaled) + blend) * inv_factor;
    } else {
        quantized_rgb = floor(scaled) * inv_factor;
    }
    quantized_rgb = pow_vec3(clamp(quantized_rgb, vec3(0.0), vec3(1.0)), inv_gamma);

    quantized_rgb = linear_to_srgb_rgb(quantized_rgb);

    fragColor = vec4(
        clamp_01(quantized_rgb.x),
        clamp_01(quantized_rgb.y),
        clamp_01(quantized_rgb.z),
        texel.w
    );
}
