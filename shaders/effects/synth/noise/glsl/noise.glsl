#version 300 es

/*
 * VNoise - Simplified value noise synthesizer.
 * From nd/noise with colorization simplified to mono and rgb only.
 * Implements deterministic value and ridged noise variants with PCG jitter.
 */

precision highp float;
precision highp int;

uniform float time;
uniform float seed;
uniform vec2 resolution;
uniform float xScale;
uniform float yScale;
uniform int noiseType;
uniform int octaves;
uniform bool ridges;
uniform float loopScale;
uniform float loopAmp;
uniform int loopOffset;
uniform int colorMode;
uniform bool wrap;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

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

float random(vec2 st) {
    return prng(vec3(st, 0.0)).x;
}

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float periodicFunction(float p) {
    return map(cos(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

int positiveModulo(int value, int modulus) {
    if (modulus == 0) return 0;
    int r = value % modulus;
    return (r < 0) ? r + modulus : r;
}

float constantFromLatticeWithOffset(vec2 lattice, vec2 freq, float s, float blend, ivec2 offset) {
    vec2 baseFloor = floor(lattice);
    ivec2 base = ivec2(baseFloor) + offset;
    vec2 frac = lattice - baseFloor;

    int seedInt = int(floor(s));
    float sFrac = fract(s);

    float xCombined = frac.x + sFrac;
    int xi = base.x + int(floor(xCombined));
    int yi = base.y;

    if (wrap) {
        int freqX = int(freq.x + 0.5);
        int freqY = int(freq.y + 0.5);
        if (freqX > 0) xi = positiveModulo(xi, freqX);
        if (freqY > 0) yi = positiveModulo(yi, freqY);
    }

    uint xBits = uint(xi);
    uint yBits = uint(yi);
    uint seedBits = uint(seedInt);
    uint fracBits = floatBitsToUint(sFrac);

    uvec3 jitter = uvec3(
        (fracBits * 374761393u) ^ 0x9E3779B9u,
        (fracBits * 668265263u) ^ 0x7F4A7C15u,
        (fracBits * 2246822519u) ^ 0x94D049B4u
    );

    uvec3 state = uvec3(xBits, yBits, seedBits) ^ jitter;
    uvec3 prngState = pcg(state);
    float noiseValue = float(prngState.x) / float(0xffffffffu);

    return periodicFunction(noiseValue - blend);
}

float constantFromLattice(vec2 lattice, vec2 freq, float s, float blend) {
    return constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2(0, 0));
}

float constant(vec2 st, vec2 freq, float s, float blend) {
    vec2 lattice = st * freq;
    return constantFromLattice(lattice, freq, s, blend);
}

float cubic(float t) {
    return t * t * (3.0 - 2.0 * t);
}

float quadratic3(float p0, float p1, float p2, float t) {
    float t2 = t * t;
    return p0 * 0.5 * (1.0 - t) * (1.0 - t) +
           p1 * 0.5 * (-2.0 * t2 + 2.0 * t + 1.0) +
           p2 * 0.5 * t2;
}

float latticeValue(vec2 lattice, vec2 freq, float s, float blend) {
    return constantFromLattice(lattice, freq, s, blend);
}

float cubic3x3ValueNoise(vec2 st, vec2 freq, float s, float blend) {
    vec2 lattice = st * freq;
    vec2 f = fract(lattice);
    
    float v00 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2(-1, -1));
    float v10 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 0, -1));
    float v20 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 1, -1));
    float v01 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2(-1,  0));
    float v11 = constantFromLattice(lattice, freq, s, blend);
    float v21 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 1,  0));
    float v02 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2(-1,  1));
    float v12 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 0,  1));
    float v22 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 1,  1));
    
    float y0 = quadratic3(v00, v10, v20, f.x);
    float y1 = quadratic3(v01, v11, v21, f.x);
    float y2 = quadratic3(v02, v12, v22, f.x);
    
    return quadratic3(y0, y1, y2, f.y);
}

float blendBicubic(float p0, float p1, float p2, float p3, float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    float b0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    float b1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    float b2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    float b3 = t3 / 6.0;
    return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;
}

float catmullRom3(float p0, float p1, float p2, float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    return p1 + 0.5 * t * (p2 - p0) + 
           0.5 * t2 * (2.0*p0 - 5.0*p1 + 4.0*p2 - p0) +
           0.5 * t3 * (-p0 + 3.0*p1 - 3.0*p2 + p0);
}

float catmullRom4(float p0, float p1, float p2, float p3, float t) {
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
}

float blendLinearOrCosine(float a, float b, float amount, int nType) {
    if (nType == 1) return mix(a, b, amount);
    return mix(a, b, smoothstep(0.0, 1.0, amount));
}

float constantOffset(vec2 lattice, vec2 freq, float s, float blend, ivec2 offset) {
    return constantFromLatticeWithOffset(lattice, freq, s, blend, offset);
}

float bicubicValue(vec2 st, vec2 freq, float s, float blend) {
    vec2 lattice = st * freq;

    float x0y0 = constantOffset(lattice, freq, s, blend, ivec2(-1, -1));
    float x0y1 = constantOffset(lattice, freq, s, blend, ivec2(-1, 0));
    float x0y2 = constantOffset(lattice, freq, s, blend, ivec2(-1, 1));
    float x0y3 = constantOffset(lattice, freq, s, blend, ivec2(-1, 2));
    float x1y0 = constantOffset(lattice, freq, s, blend, ivec2(0, -1));
    float x1y1 = constantFromLattice(lattice, freq, s, blend);
    float x1y2 = constantOffset(lattice, freq, s, blend, ivec2(0, 1));
    float x1y3 = constantOffset(lattice, freq, s, blend, ivec2(0, 2));
    float x2y0 = constantOffset(lattice, freq, s, blend, ivec2(1, -1));
    float x2y1 = constantOffset(lattice, freq, s, blend, ivec2(1, 0));
    float x2y2 = constantOffset(lattice, freq, s, blend, ivec2(1, 1));
    float x2y3 = constantOffset(lattice, freq, s, blend, ivec2(1, 2));
    float x3y0 = constantOffset(lattice, freq, s, blend, ivec2(2, -1));
    float x3y1 = constantOffset(lattice, freq, s, blend, ivec2(2, 0));
    float x3y2 = constantOffset(lattice, freq, s, blend, ivec2(2, 1));
    float x3y3 = constantOffset(lattice, freq, s, blend, ivec2(2, 2));

    vec2 frac = fract(lattice);
    float y0 = blendBicubic(x0y0, x1y0, x2y0, x3y0, frac.x);
    float y1 = blendBicubic(x0y1, x1y1, x2y1, x3y1, frac.x);
    float y2 = blendBicubic(x0y2, x1y2, x2y2, x3y2, frac.x);
    float y3 = blendBicubic(x0y3, x1y3, x2y3, x3y3, frac.x);
    return blendBicubic(y0, y1, y2, y3, frac.y);
}

float catmullRom3x3ValueNoise(vec2 st, vec2 freq, float s, float blend) {
    vec2 lattice = st * freq;
    vec2 f = fract(lattice);
    
    float v00 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2(-1, -1));
    float v10 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 0, -1));
    float v20 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 1, -1));
    float v01 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2(-1,  0));
    float v11 = constantFromLattice(lattice, freq, s, blend);
    float v21 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 1,  0));
    float v02 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2(-1,  1));
    float v12 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 0,  1));
    float v22 = constantFromLatticeWithOffset(lattice, freq, s, blend, ivec2( 1,  1));
    
    float y0 = catmullRom3(v00, v10, v20, f.x);
    float y1 = catmullRom3(v01, v11, v21, f.x);
    float y2 = catmullRom3(v02, v12, v22, f.x);
    return catmullRom3(y0, y1, y2, f.y);
}

float catmullRom4x4ValueNoise(vec2 st, vec2 freq, float s, float blend) {
    vec2 lattice = st * freq;
    
    float x0y0 = constantOffset(lattice, freq, s, blend, ivec2(-1, -1));
    float x0y1 = constantOffset(lattice, freq, s, blend, ivec2(-1, 0));
    float x0y2 = constantOffset(lattice, freq, s, blend, ivec2(-1, 1));
    float x0y3 = constantOffset(lattice, freq, s, blend, ivec2(-1, 2));
    float x1y0 = constantOffset(lattice, freq, s, blend, ivec2(0, -1));
    float x1y1 = constantFromLattice(lattice, freq, s, blend);
    float x1y2 = constantOffset(lattice, freq, s, blend, ivec2(0, 1));
    float x1y3 = constantOffset(lattice, freq, s, blend, ivec2(0, 2));
    float x2y0 = constantOffset(lattice, freq, s, blend, ivec2(1, -1));
    float x2y1 = constantOffset(lattice, freq, s, blend, ivec2(1, 0));
    float x2y2 = constantOffset(lattice, freq, s, blend, ivec2(1, 1));
    float x2y3 = constantOffset(lattice, freq, s, blend, ivec2(1, 2));
    float x3y0 = constantOffset(lattice, freq, s, blend, ivec2(2, -1));
    float x3y1 = constantOffset(lattice, freq, s, blend, ivec2(2, 0));
    float x3y2 = constantOffset(lattice, freq, s, blend, ivec2(2, 1));
    float x3y3 = constantOffset(lattice, freq, s, blend, ivec2(2, 2));

    vec2 frac = fract(lattice);
    float y0 = catmullRom4(x0y0, x1y0, x2y0, x3y0, frac.x);
    float y1 = catmullRom4(x0y1, x1y1, x2y1, x3y1, frac.x);
    float y2 = catmullRom4(x0y2, x1y2, x2y2, x3y2, frac.x);
    float y3 = catmullRom4(x0y3, x1y3, x2y3, x3y3, frac.x);
    return catmullRom4(y0, y1, y2, y3, frac.y);
}

// Simplex 2D - MIT License (Ashima Arts)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float simplexValue(vec2 st, vec2 freq, float s, float blend) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 uv = st * freq;
    uv.x += s;

    vec2 i  = floor(uv + dot(uv, C.yy));
    vec2 x0 = uv - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    float v = 130.0 * dot(m, g);

    return periodicFunction(map(v, -1.0, 1.0, 0.0, 1.0) - blend);
}

float sineNoise(vec2 st, vec2 freq, float s, float blend) {
    st *= freq;
    st.x += s;
    float a = blend;
    float b = blend;
    float c = 1.0 - blend;
    vec3 r1 = prng(vec3(s)) * 0.75 + 0.125;
    vec3 r2 = prng(vec3(s + 10.0)) * 0.75 + 0.125;
    float x = sin(r1.x * st.y + sin(r1.y * st.x + a) + sin(r1.z * st.x + b) + c);
    float y = sin(r2.x * st.x + sin(r2.y * st.y + b) + sin(r2.z * st.y + c) + a);
    return (x + y) * 0.5 + 0.5;
}

float value(vec2 st, vec2 freq, float s, float blend) {
    if (noiseType == 3) return catmullRom3x3ValueNoise(st, freq, s, blend);
    if (noiseType == 4) return catmullRom4x4ValueNoise(st, freq, s, blend);
    if (noiseType == 5) return cubic3x3ValueNoise(st, freq, s, blend);
    if (noiseType == 6) return bicubicValue(st, freq, s, blend);
    if (noiseType == 10) return simplexValue(st, freq, s, blend);
    if (noiseType == 11) return sineNoise(st, freq, s, blend);

    vec2 lattice = st * freq;
    float x1y1 = constantFromLattice(lattice, freq, s, blend);
    if (noiseType == 0) return x1y1;

    float x2y1 = constantOffset(lattice, freq, s, blend, ivec2(1, 0));
    float x1y2 = constantOffset(lattice, freq, s, blend, ivec2(0, 1));
    float x2y2 = constantOffset(lattice, freq, s, blend, ivec2(1, 1));
    vec2 frac = fract(lattice);
    float a = blendLinearOrCosine(x1y1, x2y1, frac.x, noiseType);
    float b = blendLinearOrCosine(x1y2, x2y2, frac.x, noiseType);
    return blendLinearOrCosine(a, b, frac.y, noiseType);
}

float circles(vec2 st, float freq) {
    float dist = length(st - vec2(0.5 * aspectRatio, 0.5));
    return dist * freq;
}

float rings(vec2 st, float freq) {
    float dist = length(st - vec2(0.5 * aspectRatio, 0.5));
    return cos(dist * PI * freq);
}

float diamonds(vec2 st, float freq) {
    st = gl_FragCoord.xy / resolution.y;
    st -= vec2(0.5 * aspectRatio, 0.5);
    st *= freq;
    return (cos(st.x * PI) + cos(st.y * PI));
}

float shape(vec2 st, int sides, float blend) {
    st = st * 2.0 - vec2(aspectRatio, 1.0);
    float a = atan(st.x, st.y) + PI;
    float r = TAU / float(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st) * blend;
}

float offset(vec2 st, vec2 freq) {
    if (loopOffset == 10) return circles(st, freq.x);
    if (loopOffset == 20) return shape(st, 3, freq.x * 0.5);
    if (loopOffset == 30) return (abs(st.x - 0.5 * aspectRatio) + abs(st.y - 0.5)) * freq.x * 0.5;
    if (loopOffset == 40) return shape(st, 4, freq.x * 0.5);
    if (loopOffset == 50) return shape(st, 5, freq.x * 0.5);
    if (loopOffset == 60) return shape(st, 6, freq.x * 0.5);
    if (loopOffset == 70) return shape(st, 7, freq.x * 0.5);
    if (loopOffset == 80) return shape(st, 8, freq.x * 0.5);
    if (loopOffset == 90) return shape(st, 9, freq.x * 0.5);
    if (loopOffset == 100) return shape(st, 10, freq.x * 0.5);
    if (loopOffset == 110) return shape(st, 11, freq.x * 0.5);
    if (loopOffset == 120) return shape(st, 12, freq.x * 0.5);
    if (loopOffset == 200) return st.x * freq.x * 0.5;
    if (loopOffset == 210) return st.y * freq.x * 0.5;
    if (loopOffset == 300) {
        st -= vec2(aspectRatio * 0.5, 0.5);
        return value(st, freq, seed + 50.0, 0.0);
    }
    if (loopOffset == 400) return 1.0 - rings(st, freq.x);
    if (loopOffset == 410) return 1.0 - diamonds(st, freq.x);
    return 0.0;
}

vec3 generate_octave(vec2 st, vec2 freq, float s, float blend, float layer) {
    vec3 color = vec3(0.0);
    color.r = value(st, freq, s, blend);
    color.g = value(st, freq, s + 10.0, blend);
    color.b = value(st, freq, s + 20.0, blend);
    return color;
}

vec3 multires(vec2 st, vec2 freq, int oct, float s, float blend) {
    vec3 color = vec3(0.0);
    float multiplicand = 0.0;

    for (int i = 1; i <= oct; i++) {
        float multiplier = pow(2.0, float(i));
        vec2 baseFreq = freq * 0.5 * multiplier;
        multiplicand += 1.0 / multiplier;

        vec3 layer = generate_octave(st, baseFreq, s + 10.0 * float(i), blend, float(i));

        color.rgb += layer / multiplier;
    }

    color.rgb /= multiplicand;
    
    // Simplified colorization: mono (0) or rgb (1) only
    if (colorMode == 0) {
        // mono - use blue channel
        if (ridges) color.b = 1.0 - abs(color.b * 2.0 - 1.0);
        return vec3(color.b);
    } else {
        // rgb
        if (ridges) {
            color.r = 1.0 - abs(color.r * 2.0 - 1.0);
            color.g = 1.0 - abs(color.g * 2.0 - 1.0);
            color.b = 1.0 - abs(color.b * 2.0 - 1.0);
        }
        return color;
    }
}

void main() {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution.y;
    vec2 centered = st - vec2(aspectRatio * 0.5, 0.5);

    vec2 freq = vec2(1.0);
    vec2 lf = vec2(1.0);

    if (noiseType == 11) {
        freq.x = map(xScale, 1.0, 100.0, 40.0, 1.0);
        freq.y = map(yScale, 1.0, 100.0, 40.0, 1.0);
        lf = vec2(map(loopScale, 1.0, 100.0, 10.0, 1.0));
    } else if (noiseType == 10) {
        freq.x = map(xScale, 1.0, 100.0, 6.0, 0.5);
        freq.y = map(yScale, 1.0, 100.0, 6.0, 0.5);
        lf = vec2(map(loopScale, 1.0, 100.0, 6.0, 0.5));
    } else {
        freq.x = map(xScale, 1.0, 100.0, 20.0, 3.0);
        freq.y = map(yScale, 1.0, 100.0, 20.0, 3.0);
        lf = vec2(map(loopScale, 1.0, 100.0, 12.0, 3.0));
    }

    if (loopOffset == 300) {
        vec2 nominalFreq = vec2(1.0);
        if (noiseType == 11) {
            float base = map(75.0, 1.0, 100.0, 40.0, 1.0);
            nominalFreq = vec2(base);
        } else if (noiseType == 10) {
            float base = map(75.0, 1.0, 100.0, 6.0, 0.5);
            nominalFreq = vec2(base);
        } else {
            float base = map(75.0, 1.0, 100.0, 20.0, 3.0);
            nominalFreq = vec2(base);
        }
        lf *= freq / nominalFreq;
    }

    if (noiseType != 4 && noiseType != 10 && wrap) {
        freq = floor(freq);
        if (loopOffset == 300) {
            lf = floor(lf);
        }
    }

    float t = 1.0;
    if (loopAmp < 0.0) {
        t = time + offset(st, lf);
    } else {
        t = time - offset(st, lf);
    }
    float blend = periodicFunction(t) * abs(loopAmp) * 0.01;

    color.rgb = multires(centered, freq, octaves, seed, blend);
    fragColor = color;
}
