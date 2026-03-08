#version 300 es

precision highp float;
precision highp int;

// Snow effect: blends animated static noise into the source image.

const uint CHANNEL_COUNT = 4u;
const float TAU = 6.283185307179586;
const vec3 TIME_SEED_OFFSETS = vec3(97.0, 57.0, 131.0);
const vec3 STATIC_SEED = vec3(37.0, 17.0, 53.0);
const vec3 LIMITER_SEED = vec3(113.0, 71.0, 193.0);


uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float alpha;
uniform float time;
uniform float speed;

out vec4 fragColor;

uint as_u32(float value) {
    return uint(max(round(value), 0.0));
}

float clamp_01(float value) {
    return clamp(value, 0.0, 1.0);
}

float normalized_sine(float value) {
    return (sin(value) + 1.0) * 0.5;
}

float periodic_value(float time, float value) {
    return normalized_sine((time - value) * TAU);
}

vec3 snow_fract_vec3(vec3 value) {
    return value - floor(value);
}

float snow_hash(vec3 input_sample) {
    vec3 scaled = snow_fract_vec3(input_sample * 0.1031);
    float dot_val = dot(scaled, scaled.yzx + vec3(33.33));
    vec3 shifted = scaled + dot_val;
    float combined = (shifted.x + shifted.y) * shifted.z;
    float fractional = combined - floor(combined);
    return clamp(fractional, 0.0, 1.0);
}

float snow_noise(vec2 coord, float time, float speed, vec3 seed) {
    float angle = time * TAU;
    float z_base = cos(angle) * speed;
    vec3 base_sample = vec3(coord.x + seed.x, coord.y + seed.y, z_base + seed.z);
    float base_value = snow_hash(base_sample);

    if (speed == 0.0 || time == 0.0) {
        return base_value;
    }

    vec3 time_seed = seed + TIME_SEED_OFFSETS;
    vec3 time_sample = vec3(
        coord.x + time_seed.x,
        coord.y + time_seed.y,
        1.0 + time_seed.z
    );
    float time_value = snow_hash(time_sample);
    float scaled_time = periodic_value(time, time_value) * speed;
    float periodic = periodic_value(scaled_time, base_value);
    return clamp(periodic, 0.0, 1.0);
}

void main() {
    ivec2 coords = ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y));
    vec4 texel = texelFetch(inputTex, coords, 0);

    float alphaVal = clamp(alpha, 0.0, 1.0);
    if (alphaVal <= 0.0) {
        fragColor = texel;
        return;
    }

    vec2 pixelCoord = vec2(gl_FragCoord.x, gl_FragCoord.y);
    float timeVal = time;
    float speedVal = speed * 100.0;

    float static_value = snow_noise(pixelCoord, timeVal, speedVal, STATIC_SEED);
    float limiter_value = snow_noise(pixelCoord, timeVal, speedVal, LIMITER_SEED);
    float limiter_sq = limiter_value * limiter_value;
    float limiter_pow4 = limiter_sq * limiter_sq;
    float limiter_mask = clamp(limiter_pow4 * alphaVal, 0.0, 1.0);

    vec3 static_color = vec3(static_value);
    vec3 mixed_rgb = mix(texel.xyz, static_color, vec3(limiter_mask));

    fragColor = vec4(mixed_rgb, texel.w);
}