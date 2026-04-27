/*
 * Scanline-based data corruption.
 * All corruption operates along horizontal scanlines, simulating linear
 * byte-stream corruption: pixel sorting, horizontal shifting, bit manipulation,
 * and channel separation.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;
uniform float seed;
uniform float intensity;
uniform float sort;
uniform float shift;
uniform float bits;
uniform float channelShift;
uniform float speed;
uniform float melt;
uniform float scatter;
uniform float bandHeight;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

// PCG PRNG - MIT License
uvec3 pcg(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 prng(vec3 p) {
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(0xffffffffu);
}

// Per-row time: each row gets its own phase offset so corruption
// rolls through the image rather than all rows jumping simultaneously
float rowTime(float row, float t) {
    float phase = prng(vec3(row, seed + 777.0, 0.0)).x;
    return floor((t + phase) * 8.0); // 8 state changes per time cycle, staggered
}

// Hash for a scanline region
vec3 lineHash(float line, float rt) {
    return prng(vec3(line, seed, rt));
}

// Pixel sorting: shift UV horizontally based on brightness threshold
vec2 pixelSort(vec2 uv, float row, float sortAmt, float rt, float resX) {
    vec3 rh = lineHash(row, rt);
    float threshold = mix(0.8, 0.2, sortAmt);
    float regionSize = 3.0 + rh.y * 20.0;
    float region = floor(uv.x * resX / regionSize);
    vec3 regionHash = prng(vec3(region, row, seed + rt));
    float regionPos = fract(uv.x * resX / regionSize);
    float sortShift = regionPos * regionHash.x * sortAmt * 0.15;
    if (regionHash.y > threshold) {
        uv.x = fract(uv.x + sortShift);
    }
    return uv;
}

// Byte-shift: displace scanline chunks horizontally
vec2 byteShift(vec2 uv, float row, float shiftAmt, float rt, float resX) {
    vec3 rh = lineHash(row, rt);
    float chunkWidth = 8.0 + rh.x * 80.0;
    float chunk = floor(uv.x * resX / chunkWidth);
    vec3 ch = prng(vec3(chunk, row + 200.0, seed + rt));
    float shiftPx = (ch.x - 0.5) * 2.0 * shiftAmt * resX * 0.15;
    float sparsity = mix(0.85, 0.3, shiftAmt);
    if (ch.y > sparsity) {
        uv.x = fract(uv.x + shiftPx / resX);
    }
    return uv;
}

// Bit corruption: quantize, XOR patterns, bit shifting
vec3 bitCorrupt(vec3 color, vec2 uv, float row, float bitAmt, float rt, float resX) {
    vec3 bh = lineHash(row + 400.0, rt);
    float levels = mix(256.0, 2.0, bitAmt * bitAmt);
    color = floor(color * levels + 0.5) / levels;
    if (bitAmt > 0.3) {
        float xorStrength = (bitAmt - 0.3) / 0.7;
        float px = floor(uv.x * resX);
        vec3 xorHash = prng(vec3(px, row, seed + rt + 500.0));
        vec3 mask = step(vec3(1.0 - xorStrength * 0.5), xorHash);
        color = mix(color, 1.0 - color, mask);
    }
    if (bitAmt > 0.6) {
        float shiftStr = (bitAmt - 0.6) / 0.4;
        float bitShift = floor(bh.x * 4.0) + 1.0;
        float scale = pow(2.0, bitShift);
        color = fract(color * mix(1.0, scale, shiftStr));
    }
    return color;
}

// Melt: vertical displacement weighted by position, pixels drip downward
vec2 meltDisplace(vec2 uv, float meltAmt, float t, float resX) {
    float col = floor(uv.x * resX / 3.0);
    float colPhase = prng(vec3(col, seed + 601.0, 0.0)).x;
    vec3 dripHash = prng(vec3(col, seed + 600.0, floor((t + colPhase) * 8.0)));
    float gravity = (1.0 - uv.y) * (1.0 - uv.y);
    float dripAmt = dripHash.x * meltAmt * gravity * 0.4;
    float dripProb = mix(0.9, 0.2, meltAmt);
    if (dripHash.y > dripProb) {
        float wobble = sin(uv.y * 20.0 + dripHash.z * TAU + t) * meltAmt * 0.02;
        uv.y = clamp(uv.y + dripAmt, 0.0, 1.0);
        uv.x = fract(uv.x + wobble);
    }
    return uv;
}

// Scatter: per-pixel random displacement
vec2 scatterDisplace(vec2 uv, float scatterAmt, float t, vec2 gCoord) {
    vec3 phaseHash = prng(vec3(floor(gCoord), seed + 700.0));
    float pixTime = floor((t + phaseHash.x) * 8.0);
    vec3 pixHash = prng(vec3(floor(gCoord), pixTime + seed));
    float threshold = mix(0.98, 0.1, scatterAmt * scatterAmt);
    if (pixHash.x > threshold) {
        vec3 dirHash = prng(vec3(floor(gCoord) + 1000.0, pixTime + seed));
        float dist = scatterAmt * 0.15 * (0.5 + pixHash.y * 0.5);
        uv.x = fract(uv.x + (dirHash.x - 0.5) * dist);
        uv.y = clamp(uv.y + (dirHash.y - 0.5) * dist, 0.0, 1.0);
    }
    return uv;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 resolution = vec2(textureSize(inputTex, 0));
    vec2 uv = gl_FragCoord.xy / resolution;
    float resX = fullResolution.x;
    float spd = floor(speed);
    float t = time * TAU * spd;

    // Scanline grouping
    float rawRow = globalCoord.y;
    float bh = max(1.0, floor(bandHeight * 0.32));
    float row = floor(rawRow / bh);

    // Per-row staggered time — rows change state independently
    float rt = rowTime(row, t);

    // Per-scanline corruption probability
    vec3 rowHash = lineHash(row, rt);
    float prob = intensity / 100.0;
    bool isCorrupt = rowHash.x < prob;

    vec2 sampleUv = uv;

    // 2D effects (not band-based)
    float meltAmt = melt / 100.0;
    if (meltAmt > 0.0) {
        sampleUv = meltDisplace(sampleUv, meltAmt, t, resX);
    }
    float scatterAmt = scatter / 100.0;
    if (scatterAmt > 0.0) {
        sampleUv = scatterDisplace(sampleUv, scatterAmt, t, globalCoord);
    }

    // Band-based corruption to UV
    if (isCorrupt) {
        float sortAmt = sort / 100.0;
        float shiftAmt = shift / 100.0;
        if (sortAmt > 0.0) {
            sampleUv = pixelSort(sampleUv, row, sortAmt, rt, resX);
        }
        if (shiftAmt > 0.0) {
            sampleUv = byteShift(sampleUv, row, shiftAmt, rt, resX);
        }
    }

    // Sample color from input
    vec3 color = texture(inputTex, sampleUv).rgb;

    // Channel separation
    if (channelShift > 0.0 && isCorrupt) {
        float chAmt = channelShift / 100.0;
        vec3 chHash = lineHash(row + 300.0, rt);
        float rShift = (chHash.x - 0.5) * chAmt * 0.08;
        float bShift = (chHash.y - 0.5) * chAmt * 0.08;
        vec2 rUv = vec2(fract(sampleUv.x + rShift), sampleUv.y);
        vec2 bUv = vec2(fract(sampleUv.x + bShift), sampleUv.y);
        color.r = texture(inputTex, rUv).r;
        color.b = texture(inputTex, bUv).b;
    }

    // Bit corruption
    if (bits > 0.0 && isCorrupt) {
        color = bitCorrupt(color, uv, row, bits / 100.0, rt, resX);
    }

    fragColor = vec4(color, 1.0);
}
