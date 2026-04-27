/*
 * Perlin noise-based warp distortion
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;
uniform float strength;
uniform float scale;
uniform int seed;
uniform int speed;
uniform int wrap;
uniform bool antialias;

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
    angle += time * TAU * float(speed);
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
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    float aspectRatio = fullResolution.x / fullResolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 globalUV = globalCoord / fullResolution;

    // Perlin warp — sample both axes before applying either
    vec2 noiseCoord = globalUV * vec2(aspectRatio, 1.0);
    vec2 noiseScale = vec2(abs(scale * 3.0));
    float dx = (perlinNoise(noiseCoord + float(seed), noiseScale) - 0.5) * strength * 0.01;
    float dy = (perlinNoise(noiseCoord + float(seed) + 10.0, noiseScale) - 0.5) * strength * 0.01;
    uv.x += dx;
    uv.y += dy;

    // Apply wrap mode
    if (wrap == 0) {
        // mirror
        uv = abs(mod(uv + 1.0, 2.0) - 1.0);
    } else if (wrap == 1) {
        // repeat
        uv = mod(uv, 1.0);
    } else {
        // clamp
        uv = clamp(uv, 0.0, 1.0);
    }

    if (antialias) {
        vec2 dx = dFdx(uv);
        vec2 dy = dFdy(uv);
        vec4 col = vec4(0.0);
        col += texture(inputTex, uv + dx * -0.375 + dy * -0.125);
        col += texture(inputTex, uv + dx *  0.125 + dy * -0.375);
        col += texture(inputTex, uv + dx *  0.375 + dy *  0.125);
        col += texture(inputTex, uv + dx * -0.125 + dy *  0.375);
        fragColor = col * 0.25;
    } else {
        fragColor = texture(inputTex, uv);
    }
}
