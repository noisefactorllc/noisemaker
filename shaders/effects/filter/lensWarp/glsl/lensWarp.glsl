/*
 * Lens Warp - Noise-driven radial lens distortion
 * Follows filter/warp pattern: Perlin noise displacement with singularity mask
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform float displacement;
uniform float speed;
uniform bool antialias;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

// PCG PRNG (from filter/warp)
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

    // Singularity mask: distance from center, pow(5)
    // Concentrates warp at edges, center stays stable
    vec2 delta = abs(uv - vec2(0.5));
    vec2 scaled = vec2(delta.x * aspectRatio, delta.y);
    float maxRadius = length(vec2(aspectRatio * 0.5, 0.5));
    float mask = pow(clamp(length(scaled) / maxRadius, 0.0, 1.0), 5.0);

    // Two independent Perlin noise fields for X and Y displacement
    vec2 noiseCoord = uv * vec2(aspectRatio, 1.0);
    float noiseX = perlinNoise(noiseCoord + 42.0, vec2(2.0));
    float noiseY = perlinNoise(noiseCoord + 97.0, vec2(2.0));

    // Apply displacement, masked to edges
    uv.x += (noiseX - 0.5) * displacement * mask;
    uv.y += (noiseY - 0.5) * displacement * mask;

    // Wrap (mirror)
    uv = abs(mod(uv + 1.0, 2.0) - 1.0);

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
