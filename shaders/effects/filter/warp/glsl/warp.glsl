/*
 * Perlin noise-based warp distortion
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform float strength;
uniform float scale;
uniform float seed;
uniform float speed;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

// PCG PRNG
uvec3 pcg(uvec3 v) {
    v = v * uint(1664525) + uint(1013904223);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> uint(16);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 prng(vec3 p) {
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}

float smootherstep(float x) {
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

float smoothlerp(float x, float a, float b) {
    return a + smootherstep(x) * (b - a);
}

float grid(vec2 st, vec2 cell) {
    float angle = prng(vec3(cell, 1.0)).r * TAU;
    angle += time * TAU * speed;
    vec2 gradient = vec2(cos(angle), sin(angle));
    vec2 dist = st - cell;
    return dot(gradient, dist);
}

float perlinNoise(vec2 st, vec2 noiseScale) {
    st *= noiseScale;
    vec2 cell = floor(st);
    float tl = grid(st, cell);
    float tr = grid(st, vec2(cell.x + 1.0, cell.y));
    float bl = grid(st, vec2(cell.x, cell.y + 1.0));
    float br = grid(st, cell + 1.0);
    float upper = smoothlerp(st.x - cell.x, tl, tr);
    float lower = smoothlerp(st.x - cell.x, bl, br);
    float val = smoothlerp(st.y - cell.y, upper, lower);
    return val * 0.5 + 0.5;
}

void main() {
    float aspectRatio = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;

    // Perlin warp
    uv.x += (perlinNoise(uv * vec2(aspectRatio, 1.0) + seed, vec2(abs(scale * 3.0))) - 0.5) * strength * 0.01;
    uv.y += (perlinNoise(uv * vec2(aspectRatio, 1.0) + seed + 10.0, vec2(abs(scale * 3.0))) - 0.5) * strength * 0.01;

    fragColor = texture(inputTex, uv);
}
