#version 300 es

/*
 * Splat compositor overlay shader.
 * Builds deterministic multi-octave splat and speck masks from PCG-backed Perlin noise so live tweaking remains reproducible.
 * Cutoff controls are remapped from UI ranges into thresholds to avoid abrupt transitions when layering over the input feed.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;
uniform bool enabled;
uniform bool useSpecks;
uniform int splatSource;
uniform float scale;
uniform float cutoff;
uniform float speed;
uniform float seed;
uniform vec3 splatColor;
uniform int mode;
uniform float speckScale;
uniform float speckCutoff;
uniform float speckSpeed;
uniform float speckSeed;
uniform vec3 speckColor;
uniform int speckMode;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio fullResolution.x / fullResolution.y

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG - MIT License
// https://github.com/riccardoscalco/glsl-pcg-prng
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

vec3 prng (vec3 p) {
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}
// end PCG PRNG

float smootherstep(float x) {
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

float smoothlerp(float x, float a, float b) {
    return a + smootherstep(x) * (b - a);
}

float grid(vec2 st, vec2 cell, float speed) {
    float angle = prng(vec3(cell, 1.0)).r * TAU;
    angle += time * TAU * speed;
    vec2 gradient = vec2(cos(angle), sin(angle));
    vec2 dist = st - cell;
    return dot(gradient, dist);
}

float perlin(vec2 st, vec2 scale, float speed) {
    st -= 0.5;
    st *= scale;
    st += 0.5;
    vec2 cell = floor(st);    
    float tl = grid(st, cell, speed);
    float tr = grid(st, vec2(cell.x + 1.0, cell.y), speed);
    float bl = grid(st, vec2(cell.x, cell.y + 1.0), speed);
    float br = grid(st, cell + 1.0, speed);    
    float upper = smoothlerp(st.x - cell.x, tl, tr);
    float lower = smoothlerp(st.x - cell.x, bl, br);
    float val = smoothlerp(st.y - cell.y, upper, lower);    
    return val * 0.5 + 0.5;
}

float splat(vec2 st, vec2 scale) {
    st.x += perlin(st + seed + 50.0, vec2(2.0, 3.0), 0.0) * 0.5 - 0.5;
    st.y += perlin(st + seed + 60.0, vec2(2.0, 3.0), 0.0) * 0.5 - 0.5;
    float d = perlin(st, vec2(4.0) * scale, speed) + (perlin(st + 10.0, vec2(8.0) * scale, speed) * 0.5) + (perlin(st + 20.0, vec2(16.0) * scale, speed) * 0.25);
    return step(map(cutoff, 0.0, 100.0, 0.85, 0.99), d);
}

float speckle(vec2 st, vec2 scale) {
    float d = perlin(st, scale, speckSpeed) + (perlin(st + 10.0, scale * 2.0, speckSpeed) * 0.5);
    d /= 1.5;
    return step(map(speckCutoff, 0.0, 100.0, 0.6, 0.7), d);
}

float shape(vec2 st, int sides, float blend) {
    st = st * 2.0 - vec2(aspectRatio, 1.0);
    float a = atan(st.x, st.y) + PI;
    float r = TAU / float(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st) * blend;
}


void main() {
	vec2 globalCoord = gl_FragCoord.xy + tileOffset;
	vec2 uv = globalCoord / fullResolution;

	vec4 color = texture(inputTex, uv);

    vec2 noiseCoord = uv * vec2(aspectRatio, 1.0);

    if (useSpecks) {
        float speckMask = speckle(noiseCoord + speckSeed, vec2(32.0) * map(speckScale, 1.0, 5.0, 2.0, 0.5));

        if (speckMode == 0) {
            color.rgb = mix(color.rgb, speckColor, speckMask); // color
        } else if (speckMode == 1) {
            color = texture(inputTex, uv + speckMask * 0.1); // displace
        } else if (speckMode == 2) {
            color.rgb = mix(color.rgb, 1.0 - color.rgb, speckMask); // invert
        } else if (speckMode == 3) {
            color.rgb *= speckMask; // negative
        }
    }

    if (enabled) {
        float splatMask = splat(noiseCoord + seed, vec2(map(scale, 1.0, 5.0, 2.0, 0.5)));

        if (mode == 0) {
            color.rgb = mix(color.rgb, splatColor, splatMask); // color
        } else if (mode == 1) {
            vec4 texColor = texture(inputTex, uv + splatMask * 0.1); // displace
            color = mix(color, texColor, splatMask);
        } else if (mode == 2) {
            color.rgb = mix(color.rgb, 1.0 - color.rgb, splatMask); // invert
        } else if (mode == 3) {
            color.rgb *= map(splatMask * 0.5 - 0.5, -0.25, 0.0, 0.0, 1.0); // negative
        }
    }

	fragColor = color;
}
