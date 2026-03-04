#version 300 es

/*
 * GLSL shape generator shader (mono-only variant).
 * Removed: palette colorization, hsv/oklab conversion
 * Output: grayscale intensity based on offset pattern
 */

precision highp float;
precision highp int;

uniform vec2 resolution;
uniform float time;
uniform int seed;
uniform bool wrap;
uniform int loopAOffset;
uniform int loopBOffset;
uniform float loopAScale;
uniform float loopBScale;
uniform float speedA;
uniform float speedB;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float aspectRatio;

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// Positive modulo for lattice wrapping
int positiveModulo(int a, int b) {
    int result = a - (a / b) * b;
    if (result < 0) { result += b; }
    return result;
}

// PCG random number generator
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
    if (p.x >= 0.0) { p.x *= 2.0; } else { p.x = -p.x * 2.0 + 1.0; }
    if (p.y >= 0.0) { p.y *= 2.0; } else { p.y = -p.y * 2.0 + 1.0; }
    if (p.z >= 0.0) { p.z *= 2.0; } else { p.z = -p.z * 2.0 + 1.0; }
    uvec3 u = pcg(uvec3(p));
    return vec3(u) / float(0xffffffffu);
}

float periodicFunction(float p) {
    float x = TAU * p;
    return map(sin(x), -1.0, 1.0, 0.0, 1.0);
}

vec3 randomFromLatticeWithOffset(vec2 st, float freq, ivec2 xyOffset) {
    vec2 scaled = st * freq;
    ivec2 base = ivec2(floor(scaled)) + xyOffset;
    vec2 frac = fract(scaled);

    int seedInt = seed;
    float seedFrac = 0.0;

    float xCombined = frac.x + seedFrac;
    int xi = base.x + seedInt + int(floor(xCombined));
    int yi = base.y;

    if (wrap) {
        int freqInt = int(freq + 0.5);
        if (freqInt > 0) {
            xi = positiveModulo(xi, freqInt);
            yi = positiveModulo(yi, freqInt);
        }
    }

    uint xBits = uint(xi);
    uint yBits = uint(yi);
    uint seedBits = uint(seed);
    uint fracBits = 0u;

    uvec3 jitter = uvec3(
        (fracBits * 374761393u) ^ 0x9E3779B9u,
        (fracBits * 668265263u) ^ 0x7F4A7C15u,
        (fracBits * 2246822519u) ^ 0x94D049B4u
    );

    uvec3 state = uvec3(xBits, yBits, seedBits) ^ jitter;
    uvec3 prngState = pcg(state);
    float denom = float(0xffffffffu);
    return vec3(
        float(prngState.x) / denom,
        float(prngState.y) / denom,
        float(prngState.z) / denom
    );
}

float constant(vec2 st, float freq, float speed) {
    vec3 randTime = randomFromLatticeWithOffset(st, freq, ivec2(40, 0));
    float scaledTime = periodicFunction(randTime.x - time) * map(abs(speed), 0.0, 100.0, 0.0, 0.33);

    vec3 rand = randomFromLatticeWithOffset(st, freq, ivec2(0, 0));
    return periodicFunction(rand.y - scaledTime);
}

// ---- 3×3 quadratic interpolation ----
float quadratic3(float p0, float p1, float p2, float t) {
    float t2 = t * t;
    return p0 * 0.5 * (1.0 - t) * (1.0 - t) +
           p1 * 0.5 * (-2.0 * t2 + 2.0 * t + 1.0) +
           p2 * 0.5 * t2;
}

float catmullRom3(float p0, float p1, float p2, float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    return p1 + 0.5 * t * (p2 - p0) + 
           0.5 * t2 * (2.0*p0 - 5.0*p1 + 4.0*p2 - p0) +
           0.5 * t3 * (-p0 + 3.0*p1 - 3.0*p2 + p0);
}

float quadratic3x3Value(vec2 st, float freq, float speed) {
    vec2 lattice = st * freq;
    vec2 f = fract(lattice);
    float nd = 1.0 / freq;
    
    float v00 = constant(st + vec2(-nd, -nd), freq, speed);
    float v10 = constant(st + vec2(0.0, -nd), freq, speed);
    float v20 = constant(st + vec2(nd, -nd), freq, speed);
    
    float v01 = constant(st + vec2(-nd, 0.0), freq, speed);
    float v11 = constant(st, freq, speed);
    float v21 = constant(st + vec2(nd, 0.0), freq, speed);
    
    float v02 = constant(st + vec2(-nd, nd), freq, speed);
    float v12 = constant(st + vec2(0.0, nd), freq, speed);
    float v22 = constant(st + vec2(nd, nd), freq, speed);
    
    float y0 = quadratic3(v00, v10, v20, f.x);
    float y1 = quadratic3(v01, v11, v21, f.x);
    float y2 = quadratic3(v02, v12, v22, f.x);
    
    return quadratic3(y0, y1, y2, f.y);
}

float catmullRom3x3Value(vec2 st, float freq, float speed) {
    vec2 lattice = st * freq;
    vec2 f = fract(lattice);
    float nd = 1.0 / freq;
    
    float v00 = constant(st + vec2(-nd, -nd), freq, speed);
    float v10 = constant(st + vec2(0.0, -nd), freq, speed);
    float v20 = constant(st + vec2(nd, -nd), freq, speed);
    
    float v01 = constant(st + vec2(-nd, 0.0), freq, speed);
    float v11 = constant(st, freq, speed);
    float v21 = constant(st + vec2(nd, 0.0), freq, speed);
    
    float v02 = constant(st + vec2(-nd, nd), freq, speed);
    float v12 = constant(st + vec2(0.0, nd), freq, speed);
    float v22 = constant(st + vec2(nd, nd), freq, speed);
    
    float y0 = catmullRom3(v00, v10, v20, f.x);
    float y1 = catmullRom3(v01, v11, v21, f.x);
    float y2 = catmullRom3(v02, v12, v22, f.x);
    
    return catmullRom3(y0, y1, y2, f.y);
}

// ---- 4×4 interpolation ----
float blendBicubic(float p0, float p1, float p2, float p3, float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    
    float b0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    float b1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    float b2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    float b3 = t3 / 6.0;
    
    return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;
}

float catmullRom4(float p0, float p1, float p2, float p3, float t) {
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + 
           t * (3.0 * (p1 - p2) + p3 - p0)));
}

float blendLinearOrCosine(float a, float b, float amount, int interp) {
    if (interp == 1) {
        return mix(a, b, amount);
    }
    return mix(a, b, smoothstep(0.0, 1.0, amount));
}

// Simplex 2D noise
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x*34.0)+1.0)*x);
}

float simplexValue(vec2 st, float freq, float s, float blend) {
    const vec4 C = vec4(0.211324865405187,
                        0.366025403784439,
                       -0.577350269189626,
                        0.024390243902439);

    vec2 uv = st * freq;
    uv.x += s;

    vec2 i  = floor(uv + dot(uv, C.yy));
    vec2 x0 = uv - i + dot(i, C.xx);

    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
          + i.x + vec3(0.0, i1.x, 1.0));

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;

    float v = 130.0 * dot(m, g);

    return periodicFunction(map(v, -1.0, 1.0, 0.0, 1.0) - blend);
}

float sineNoise(vec2 st, float freq, float s, float blend) {
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

float bicubicValue(vec2 st, float freq, float speed) {
    float ndX = 1.0 / freq;
    float ndY = 1.0 / freq;

    float u0 = st.x - ndX;
    float u1 = st.x;
    float u2 = st.x + ndX;
    float u3 = st.x + ndX + ndX;

    float v0 = st.y - ndY;
    float v1 = st.y;
    float v2 = st.y + ndY;
    float v3 = st.y + ndY + ndY;

    float x0y0 = constant(vec2(u0, v0), freq, speed);
    float x0y1 = constant(vec2(u0, v1), freq, speed);
    float x0y2 = constant(vec2(u0, v2), freq, speed);
    float x0y3 = constant(vec2(u0, v3), freq, speed);

    float x1y0 = constant(vec2(u1, v0), freq, speed);
    float x1y1 = constant(st, freq, speed);
    float x1y2 = constant(vec2(u1, v2), freq, speed);
    float x1y3 = constant(vec2(u1, v3), freq, speed);

    float x2y0 = constant(vec2(u2, v0), freq, speed);
    float x2y1 = constant(vec2(u2, v1), freq, speed);
    float x2y2 = constant(vec2(u2, v2), freq, speed);
    float x2y3 = constant(vec2(u2, v3), freq, speed);

    float x3y0 = constant(vec2(u3, v0), freq, speed);
    float x3y1 = constant(vec2(u3, v1), freq, speed);
    float x3y2 = constant(vec2(u3, v2), freq, speed);
    float x3y3 = constant(vec2(u3, v3), freq, speed);

    vec2 uv = st * freq;

    float y0 = blendBicubic(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    float y1 = blendBicubic(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    float y2 = blendBicubic(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    float y3 = blendBicubic(x0y3, x1y3, x2y3, x3y3, fract(uv.x));

    return blendBicubic(y0, y1, y2, y3, fract(uv.y));
}

float catmullRom4x4Value(vec2 st, float freq, float speed) {
    float ndX = 1.0 / freq;
    float ndY = 1.0 / freq;

    float u0 = st.x - ndX;
    float u1 = st.x;
    float u2 = st.x + ndX;
    float u3 = st.x + ndX + ndX;

    float v0 = st.y - ndY;
    float v1 = st.y;
    float v2 = st.y + ndY;
    float v3 = st.y + ndY + ndY;

    float x0y0 = constant(vec2(u0, v0), freq, speed);
    float x0y1 = constant(vec2(u0, v1), freq, speed);
    float x0y2 = constant(vec2(u0, v2), freq, speed);
    float x0y3 = constant(vec2(u0, v3), freq, speed);

    float x1y0 = constant(vec2(u1, v0), freq, speed);
    float x1y1 = constant(st, freq, speed);
    float x1y2 = constant(vec2(u1, v2), freq, speed);
    float x1y3 = constant(vec2(u1, v3), freq, speed);

    float x2y0 = constant(vec2(u2, v0), freq, speed);
    float x2y1 = constant(vec2(u2, v1), freq, speed);
    float x2y2 = constant(vec2(u2, v2), freq, speed);
    float x2y3 = constant(vec2(u2, v3), freq, speed);

    float x3y0 = constant(vec2(u3, v0), freq, speed);
    float x3y1 = constant(vec2(u3, v1), freq, speed);
    float x3y2 = constant(vec2(u3, v2), freq, speed);
    float x3y3 = constant(vec2(u3, v3), freq, speed);

    vec2 uv = st * freq;

    float y0 = catmullRom4(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    float y1 = catmullRom4(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    float y2 = catmullRom4(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    float y3 = catmullRom4(x0y3, x1y3, x2y3, x3y3, fract(uv.x));

    return catmullRom4(y0, y1, y2, y3, fract(uv.y));
}

float value(vec2 st, float freq, int interp, float speed) {
    if (interp == 3) {
        return catmullRom3x3Value(st, freq, speed);
    } else if (interp == 4) {
        return catmullRom4x4Value(st, freq, speed);
    } else if (interp == 5) {
        return quadratic3x3Value(st, freq, speed);
    } else if (interp == 6) {
        return bicubicValue(st, freq, speed);
    } else if (interp == 10) {
        float scaledTime = periodicFunction(time) * map(abs(speed), 0.0, 100.0, 0.0, 0.333);
        return simplexValue(st, freq, float(seed), scaledTime);
    } else if (interp == 11) {
        float scaledTime = periodicFunction(time) * map(abs(speed), 0.0, 100.0, 0.0, 0.333);
        return sineNoise(st, freq, float(seed), scaledTime);
    }

    float x1y1 = constant(st, freq, speed);

    if (interp == 0) {
        return x1y1;
    }

    float ndX = 1.0 / freq;
    float ndY = 1.0 / freq;

    float x1y2 = constant(vec2(st.x, st.y + ndY), freq, speed);
    float x2y1 = constant(vec2(st.x + ndX, st.y), freq, speed);
    float x2y2 = constant(vec2(st.x + ndX, st.y + ndY), freq, speed);

    vec2 uv = st * freq;

    float a = blendLinearOrCosine(x1y1, x2y1, fract(uv.x), interp);
    float b = blendLinearOrCosine(x1y2, x2y2, fract(uv.x), interp);

    return blendLinearOrCosine(a, b, fract(uv.y), interp);
}

// Shape functions
float circles(vec2 st, float freq) {
    float dist = length(st - vec2(0.5 * aspectRatio, 0.5));
    return dist * freq;
}

float rings(vec2 st, float freq) {
    float dist = length(st - vec2(0.5 * aspectRatio, 0.5));
    return cos(dist * PI * freq);
}

float diamonds(vec2 st, float freq) {
    vec2 stLocal = gl_FragCoord.xy / resolution.y;
    stLocal -= vec2(0.5 * aspectRatio, 0.5);
    stLocal *= freq;
    return (cos(stLocal.x * PI) + cos(stLocal.y * PI));
}

float shape(vec2 st, int sides, float blend) {
    st = st * 2.0 - vec2(aspectRatio, 1.0);
    float a = atan(st.x, st.y) + PI;
    float r = TAU / float(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st) * blend;
}

float offset(vec2 st, float freq, int loopOffset, float speed, float seedVal) {
    if (loopOffset == 10) {
        return circles(st, freq);
    } else if (loopOffset == 20) {
        return shape(st, 3, freq * 0.5);
    } else if (loopOffset == 30) {
        return (abs(st.x - 0.5 * aspectRatio) + abs(st.y - 0.5)) * freq * 0.5;
    } else if (loopOffset == 40) {
        return shape(st, 4, freq * 0.5);
    } else if (loopOffset == 50) {
        return shape(st, 5, freq * 0.5);
    } else if (loopOffset == 60) {
        return shape(st, 6, freq * 0.5);
    } else if (loopOffset == 70) {
        return shape(st, 7, freq * 0.5);
    } else if (loopOffset == 80) {
        return shape(st, 8, freq * 0.5);
    } else if (loopOffset == 90) {
        return shape(st, 9, freq * 0.5);
    } else if (loopOffset == 100) {
        return shape(st, 10, freq * 0.5);
    } else if (loopOffset == 110) {
        return shape(st, 11, freq * 0.5);
    } else if (loopOffset == 120) {
        return shape(st, 12, freq * 0.5);
    } else if (loopOffset == 200) {
        return st.x * freq * 0.5;
    } else if (loopOffset == 210) {
        return st.y * freq * 0.5;
    } else if (loopOffset == 300) {
        float localFreq = map(freq, 1.0, 6.0, 1.0, 20.0);
        return 1.0 - value(st + seedVal, localFreq, 0, speed);
    } else if (loopOffset == 310) {
        return 1.0 - value(st + seedVal, freq, 1, speed);
    } else if (loopOffset == 320) {
        return 1.0 - value(st + seedVal, freq, 2, speed);
    } else if (loopOffset == 330) {
        return 1.0 - value(st + seedVal, freq, 3, speed);
    } else if (loopOffset == 340) {
        return 1.0 - value(st + seedVal, freq, 4, speed);
    } else if (loopOffset == 350) {
        return 1.0 - value(st + seedVal, freq, 5, speed);
    } else if (loopOffset == 360) {
        return 1.0 - value(st + seedVal, freq, 6, speed);
    } else if (loopOffset == 370) {
        return 1.0 - value(st + seedVal, freq, 10, speed);
    } else if (loopOffset == 380) {
        return 1.0 - value(st + seedVal, freq, 11, speed);
    } else if (loopOffset == 400) {
        return 1.0 - rings(st, freq);
    } else if (loopOffset == 410) {
        return 1.0 - diamonds(st, freq);
    }
    return 0.0;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution.y;
    aspectRatio = resolution.x / resolution.y;

    float lf1 = map(loopAScale, 1.0, 100.0, 6.0, 1.0);
    if (wrap) {
        lf1 = floor(lf1);
        if (loopAOffset >= 200 && loopAOffset < 300) {
            lf1 *= 2.0;
        }
    }
    float amp1 = map(abs(speedA), 0.0, 100.0, 0.0, 1.0);
    float t1 = 1.0;
    if (speedA < 0.0) {
        t1 = time + offset(st, lf1, loopAOffset, amp1, float(seed));
    } else if (speedA > 0.0) {
        t1 = time - offset(st, lf1, loopAOffset, amp1, float(seed));
    }

    float lf2 = map(loopBScale, 1.0, 100.0, 6.0, 1.0);
    if (wrap) {
        lf2 = floor(lf2);
        if (loopBOffset >= 200 && loopBOffset < 300) {
            lf2 *= 2.0;
        }
    }
    float amp2 = map(abs(speedB), 0.0, 100.0, 0.0, 1.0);
    float t2 = 1.0;
    if (speedB < 0.0) {
        t2 = time + offset(st, lf2, loopBOffset, amp2, float(seed) + 10.0);
    } else if (speedB > 0.0) {
        t2 = time - offset(st, lf2, loopBOffset, amp2, float(seed) + 10.0);
    }

    float a = periodicFunction(t1) * amp1;
    float b = periodicFunction(t2) * amp2;

    float d = abs((a + b) - 1.0);

    // Mono output: grayscale intensity
    color.rgb = vec3(d);

    fragColor = color;
}
