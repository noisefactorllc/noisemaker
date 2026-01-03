#version 300 es

precision highp float;
precision highp int;

// Generates a scratch intensity mask using layered stripe functions that
// roughly mimic the original worms-driven trails.

uniform sampler2D inputTex;
uniform float time;
uniform float speed;
uniform int seed;

out vec4 fragColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float stripePattern(vec2 pixelPos, float angle, float period, float thickness, float t, vec2 resolution) {
    float c = cos(angle);
    float s = sin(angle);
    mat2 rotation = mat2(c, -s, s, c);
    vec2 rotated = rotation * (pixelPos - 0.5 * resolution);
    float phase = (rotated.y + t) / max(period, 1.0);
    float band = abs(fract(phase) - 0.5);
    return smoothstep(thickness, 0.0, band);
}

void main() {
    ivec2 dims = textureSize(inputTex, 0);
    if (dims.x <= 0 || dims.y <= 0) {
        fragColor = vec4(0.0);
        return;
    }
    
    vec2 resolution = vec2(float(dims.x), float(dims.y));
    vec2 pixelPos = gl_FragCoord.xy + vec2(0.5);
    vec2 uv = pixelPos / resolution;

    vec4 base = texture(inputTex, uv);
    float luminance = dot(base.rgb, vec3(0.299, 0.587, 0.114));

    float speedScale = speed * 0.6 + 0.4;
    float timeOffset = time * speedScale * resolution.y;

    float h1 = hash(vec2(float(seed), 1.0));
    float h2 = hash(vec2(float(seed), 5.0));
    float h3 = hash(vec2(float(seed), 11.0));

    float stripesA = stripePattern(pixelPos, mix(-0.45, 0.35, h1), mix(60.0, 110.0, h2), 0.18, timeOffset * 0.25, resolution);
    float stripesB = stripePattern(pixelPos, mix(-1.1, 1.1, h2), mix(40.0, 80.0, h3), 0.12, timeOffset * 0.15, resolution);
    float stripesC = stripePattern(pixelPos, mix(-0.2, 0.2, h3), mix(90.0, 160.0, h1), 0.09, timeOffset * 0.35, resolution);

    float randomNoise = hash(pixelPos / max(resolution, vec2(1.0)) + float(seed) * 1.37 + time * 0.01);
    float baseInfluence = smoothstep(0.35, 0.85, luminance);

    float mask = stripesA * 0.65 + stripesB * 0.55 + stripesC * 0.75;
    mask = max(mask, baseInfluence * 0.5);
    mask = clamp(mask + randomNoise * 0.15, 0.0, 1.0);

    fragColor = vec4(vec3(mask), 1.0);
}
