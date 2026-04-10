#version 300 es

/*
 * Moodscape shader.
 * Refracted value noise with multiple color modes.
 */

precision highp float;
precision highp int;

// NOISE_TYPE is a compile-time define injected by the runtime (see
// definition.js `globals.NOISE_TYPE.define`). Wrapping the variant dispatch in
// #if blocks instead of a runtime if-cascade avoids ANGLE→D3D inlining the
// entire 9-way decision tree at every call site, which produced ~35 second
// compiles on Windows Chrome — see HANDOFF-shader-compile.md.
#ifndef NOISE_TYPE
#define NOISE_TYPE 10
#endif

uniform float time;
uniform int seed;
uniform bool wrap;
uniform vec2 resolution;
uniform float noiseScale;
uniform int colorMode;
uniform float refractAmt;
uniform float speed;
uniform float hueRotation;
uniform float hueRange;
uniform float intensity;
uniform bool ridges;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

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

vec3 brightnessContrast(vec3 color) {
    float bright = map(intensity, -100.0, 100.0, -0.4, 0.4);
    float cont = 1.0;
    if ( intensity < 0.0) {
        cont = map(intensity, -100.0, 0.0, 0.5, 1.0);
    } else {
        cont = map(intensity, 0.0, 100.0, 1.0, 1.5);
    }

    color = (color - 0.5) * cont + 0.5 + bright;
    return color;
}

vec3 hsv2rgb(vec3 hsv) {
    float h = fract(hsv.x);
    float s = hsv.y;
    float v = hsv.z;
    
    float c = v * s; // Chroma
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = v - c;

    vec3 rgb;

    if (0.0 <= h && h < 1.0/6.0) {
        rgb = vec3(c, x, 0.0);
    } else if (1.0/6.0 <= h && h < 2.0/6.0) {
        rgb = vec3(x, c, 0.0);
    } else if (2.0/6.0 <= h && h < 3.0/6.0) {
        rgb = vec3(0.0, c, x);
    } else if (3.0/6.0 <= h && h < 4.0/6.0) {
        rgb = vec3(0.0, x, c);
    } else if (4.0/6.0 <= h && h < 5.0/6.0) {
        rgb = vec3(x, 0.0, c);
    } else if (5.0/6.0 <= h && h < 1.0) {
        rgb = vec3(c, 0.0, x);
    } else {
        rgb = vec3(0.0, 0.0, 0.0);
    }

    return rgb + vec3(m, m, m);
}

vec3 rgb2hsv(vec3 rgb) {
    float r = rgb.r;
    float g = rgb.g;
    float b = rgb.b;
    
    float max = max(r, max(g, b));
    float min = min(r, min(g, b));
    float delta = max - min;

    float h = 0.0;
    if (delta != 0.0) {
        if (max == r) {
            h = mod((g - b) / delta, 6.0) / 6.0;
        } else if (max == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (max == b) {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    
    float s = (max == 0.0) ? 0.0 : delta / max;
    float v = max;

    return vec3(h, s, v);
}

vec3 linearToSrgb(vec3 linear) {
    vec3 srgb;
    for (int i = 0; i < 3; ++i) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// oklab transform and inverse - Public Domain/MIT License
// https://bottosson.github.io/posts/oklab/

const mat3 fwdA = mat3(1.0, 1.0, 1.0,
                       0.3963377774, -0.1055613458, -0.0894841775,
                       0.2158037573, -0.0638541728, -1.2914855480);

const mat3 fwdB = mat3(4.0767245293, -1.2681437731, -0.0041119885,
                       -3.3072168827, 2.6093323231, -0.7034763098,
                       0.2307590544, -0.3411344290,  1.7068625689);

const mat3 invB = mat3(0.4121656120, 0.2118591070, 0.0883097947,
                       0.5362752080, 0.6807189584, 0.2818474174,
                       0.0514575653, 0.1074065790, 0.6302613616);

const mat3 invA = mat3(0.2104542553, 1.9779984951, 0.0259040371,
                       0.7936177850, -2.4285922050, 0.7827717662,
                       -0.0040720468, 0.4505937099, -0.8086757660);

vec3 oklab_from_linear_srgb(vec3 c) {
    vec3 lms = invB * c;

    return invA * (sign(lms)*pow(abs(lms), vec3(0.3333333333333)));
}

vec3 linear_srgb_from_oklab(vec3 c) {
    vec3 lms = fwdA * c;

    return fwdB * (lms * lms * lms);
}
// end oklab

// periodic function for looping
float periodicFunction(float p) {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

// Simplex 2D - MIT License
// https://github.com/ashima/webgl-noise/blob/master/src/noise2D.glsl
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x*34.0)+1.0)*x);
}

#if NOISE_TYPE == 10
float simplexValue(vec2 st, float xFreq, float yFreq, float s, float blend) {
    const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                        0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                       -0.577350269189626,  // -1.0 + 2.0 * C.x
                        0.024390243902439); // 1.0 / 41.0

    vec2 uv = vec2(st.x * xFreq, st.y * yFreq);
    uv.x += s;

    // First corner
    vec2 i  = floor(uv + dot(uv, C.yy) );
    vec2 x0 = uv -   i + dot(i, C.xx);

    // Other corners
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    // Permutations
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
		  + i.x + vec3(0.0, i1.x, 1.0 ));

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;

    float v = 130.0 * dot(m, g);

    return periodicFunction(map(v, -1.0, 1.0, 0.0, 1.0) - blend);
}
// end simplex

#endif

#if NOISE_TYPE == 11
float sineNoise(vec2 st, float xFreq, float yFreq, float s, float blend) {
    vec2 uv = vec2(st.x * xFreq, st.y * yFreq);
    uv.x += s;

    float a = blend;
    float b = blend;
    float c = 1.0 - blend;

    vec3 r1 = prng(vec3(s, 0.0, 0.0)) * 0.75 + 0.125;
    vec3 r2 = prng(vec3(s + 10.0, 0.0, 0.0)) * 0.75 + 0.125;
    float x = sin(r1.x * uv.y + sin(r1.y * uv.x + a) + sin(r1.z * uv.x + b) + c);
    float y = sin(r2.x * uv.x + sin(r2.y * uv.y + b) + sin(r2.z * uv.y + c) + a);

    return (x + y) * 0.5 + 0.5;
}
#endif

// Noisemaker value noise - MIT License
int positiveModulo(int value, int modulus) {
    if (modulus == 0) {
        return 0;
    }

    int r = value % modulus;
    return (r < 0) ? r + modulus : r;
}

vec3 randomFromLatticeWithOffset(vec2 st, float xFreq, float yFreq, float s, ivec2 offset) {
    vec2 lattice = vec2(st.x * xFreq, st.y * yFreq);
    vec2 baseFloor = floor(lattice);
    ivec2 base = ivec2(baseFloor) + offset;
    vec2 frac = lattice - baseFloor;

    int seedInt = int(floor(s));
    float seedFrac = fract(s);

    float xCombined = frac.x + seedFrac;
    int xi = base.x + seedInt + int(floor(xCombined));
    int yi = base.y;

    if (wrap) {
        int freqXInt = int(xFreq + 0.5);
        int freqYInt = int(yFreq + 0.5);

        if (freqXInt > 0) {
            xi = positiveModulo(xi, freqXInt);
        }
        if (freqYInt > 0) {
            yi = positiveModulo(yi, freqYInt);
        }
    }

    uint xBits = uint(xi);
    uint yBits = uint(yi);
    uint seedBits = uint(seed);
    uint fracBits = floatBitsToUint(seedFrac);

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

float constant(vec2 st, float xFreq, float yFreq, float s) {
    vec3 rand = randomFromLatticeWithOffset(st, xFreq, yFreq, s, ivec2(0, 0));
    float scaledTime = periodicFunction(rand.x - time) * map(abs(speed), 0.0, 100.0, 0.0, 0.25);
    return periodicFunction(rand.y - scaledTime);
}

float constantOffset(vec2 st, float xFreq, float yFreq, float s, ivec2 offset) {
    vec3 rand = randomFromLatticeWithOffset(st, xFreq, yFreq, s, offset);
    float scaledTime = periodicFunction(rand.x - time) * map(abs(speed), 0.0, 100.0, 0.0, 0.25);
    return periodicFunction(rand.y - scaledTime);
}

// 3x3 quadratic interpolation
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

#if NOISE_TYPE == 5
float quadratic3x3Value(vec2 st, float xFreq, float yFreq, float s) {
    vec2 lattice = vec2(st.x * xFreq, st.y * yFreq);
    vec2 f = fract(lattice);
    
    float v00 = constantOffset(st, xFreq, yFreq, s, ivec2(-1, -1));
    float v10 = constantOffset(st, xFreq, yFreq, s, ivec2( 0, -1));
    float v20 = constantOffset(st, xFreq, yFreq, s, ivec2( 1, -1));
    
    float v01 = constantOffset(st, xFreq, yFreq, s, ivec2(-1, 0));
    float v11 = constant(st, xFreq, yFreq, s);
    float v21 = constantOffset(st, xFreq, yFreq, s, ivec2( 1, 0));
    
    float v02 = constantOffset(st, xFreq, yFreq, s, ivec2(-1, 1));
    float v12 = constantOffset(st, xFreq, yFreq, s, ivec2( 0, 1));
    float v22 = constantOffset(st, xFreq, yFreq, s, ivec2( 1, 1));
    
    float y0 = quadratic3(v00, v10, v20, f.x);
    float y1 = quadratic3(v01, v11, v21, f.x);
    float y2 = quadratic3(v02, v12, v22, f.x);
    
    return quadratic3(y0, y1, y2, f.y);
}

#endif

#if NOISE_TYPE == 3
float catmullRom3x3Value(vec2 st, float xFreq, float yFreq, float s) {
    vec2 lattice = vec2(st.x * xFreq, st.y * yFreq);
    vec2 f = fract(lattice);
    
    float v00 = constantOffset(st, xFreq, yFreq, s, ivec2(-1, -1));
    float v10 = constantOffset(st, xFreq, yFreq, s, ivec2( 0, -1));
    float v20 = constantOffset(st, xFreq, yFreq, s, ivec2( 1, -1));
    
    float v01 = constantOffset(st, xFreq, yFreq, s, ivec2(-1, 0));
    float v11 = constant(st, xFreq, yFreq, s);
    float v21 = constantOffset(st, xFreq, yFreq, s, ivec2( 1, 0));
    
    float v02 = constantOffset(st, xFreq, yFreq, s, ivec2(-1, 1));
    float v12 = constantOffset(st, xFreq, yFreq, s, ivec2( 0, 1));
    float v22 = constantOffset(st, xFreq, yFreq, s, ivec2( 1, 1));
    
    float y0 = catmullRom3(v00, v10, v20, f.x);
    float y1 = catmullRom3(v01, v11, v21, f.x);
    float y2 = catmullRom3(v02, v12, v22, f.x);
    
    return catmullRom3(y0, y1, y2, f.y);
}
#endif

// cubic B-spline interpolation
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

float blendLinearOrCosine(float a, float b, float amount, int nType) {
    if (nType == 1) {
        return mix(a, b, amount);
    }

    return mix(a, b, smoothstep(0.0, 1.0, amount));
}

#if NOISE_TYPE == 6
float bicubicValue(vec2 st, float xFreq, float yFreq, float s) {
    vec2 uv = vec2(st.x * xFreq, st.y * yFreq);
    vec2 f = fract(uv);

    float x0y0 = constantOffset(st, xFreq, yFreq, s, ivec2(-1, -1));
    float x0y1 = constantOffset(st, xFreq, yFreq, s, ivec2(-1,  0));
    float x0y2 = constantOffset(st, xFreq, yFreq, s, ivec2(-1,  1));
    float x0y3 = constantOffset(st, xFreq, yFreq, s, ivec2(-1,  2));

    float x1y0 = constantOffset(st, xFreq, yFreq, s, ivec2( 0, -1));
    float x1y1 = constant(st, xFreq, yFreq, s);
    float x1y2 = constantOffset(st, xFreq, yFreq, s, ivec2( 0,  1));
    float x1y3 = constantOffset(st, xFreq, yFreq, s, ivec2( 0,  2));

    float x2y0 = constantOffset(st, xFreq, yFreq, s, ivec2( 1, -1));
    float x2y1 = constantOffset(st, xFreq, yFreq, s, ivec2( 1,  0));
    float x2y2 = constantOffset(st, xFreq, yFreq, s, ivec2( 1,  1));
    float x2y3 = constantOffset(st, xFreq, yFreq, s, ivec2( 1,  2));

    float x3y0 = constantOffset(st, xFreq, yFreq, s, ivec2( 2, -1));
    float x3y1 = constantOffset(st, xFreq, yFreq, s, ivec2( 2,  0));
    float x3y2 = constantOffset(st, xFreq, yFreq, s, ivec2( 2,  1));
    float x3y3 = constantOffset(st, xFreq, yFreq, s, ivec2( 2,  2));

    float y0 = blendBicubic(x0y0, x1y0, x2y0, x3y0, f.x);
    float y1 = blendBicubic(x0y1, x1y1, x2y1, x3y1, f.x);
    float y2 = blendBicubic(x0y2, x1y2, x2y2, x3y2, f.x);
    float y3 = blendBicubic(x0y3, x1y3, x2y3, x3y3, f.x);

    return clamp(blendBicubic(y0, y1, y2, y3, f.y), 0.0, 1.0);
}

#endif

#if NOISE_TYPE == 4
float catmullRom4x4Value(vec2 st, float xFreq, float yFreq, float s) {
    vec2 uv = vec2(st.x * xFreq, st.y * yFreq);
    vec2 f = fract(uv);

    float x0y0 = constantOffset(st, xFreq, yFreq, s, ivec2(-1, -1));
    float x0y1 = constantOffset(st, xFreq, yFreq, s, ivec2(-1,  0));
    float x0y2 = constantOffset(st, xFreq, yFreq, s, ivec2(-1,  1));
    float x0y3 = constantOffset(st, xFreq, yFreq, s, ivec2(-1,  2));

    float x1y0 = constantOffset(st, xFreq, yFreq, s, ivec2( 0, -1));
    float x1y1 = constant(st, xFreq, yFreq, s);
    float x1y2 = constantOffset(st, xFreq, yFreq, s, ivec2( 0,  1));
    float x1y3 = constantOffset(st, xFreq, yFreq, s, ivec2( 0,  2));

    float x2y0 = constantOffset(st, xFreq, yFreq, s, ivec2( 1, -1));
    float x2y1 = constantOffset(st, xFreq, yFreq, s, ivec2( 1,  0));
    float x2y2 = constantOffset(st, xFreq, yFreq, s, ivec2( 1,  1));
    float x2y3 = constantOffset(st, xFreq, yFreq, s, ivec2( 1,  2));

    float x3y0 = constantOffset(st, xFreq, yFreq, s, ivec2( 2, -1));
    float x3y1 = constantOffset(st, xFreq, yFreq, s, ivec2( 2,  0));
    float x3y2 = constantOffset(st, xFreq, yFreq, s, ivec2( 2,  1));
    float x3y3 = constantOffset(st, xFreq, yFreq, s, ivec2( 2,  2));

    float y0 = catmullRom4(x0y0, x1y0, x2y0, x3y0, f.x);
    float y1 = catmullRom4(x0y1, x1y1, x2y1, x3y1, f.x);
    float y2 = catmullRom4(x0y2, x1y2, x2y2, x3y2, f.x);
    float y3 = catmullRom4(x0y3, x1y3, x2y3, x3y3, f.x);

    return clamp(catmullRom4(y0, y1, y2, y3, f.y), 0.0, 1.0);
}
#endif

float value(vec2 st, float xFreq, float yFreq, float s) {
#if NOISE_TYPE == 0
    return constant(st, xFreq, yFreq, s);
#elif NOISE_TYPE == 3
    return catmullRom3x3Value(st, xFreq, yFreq, s);
#elif NOISE_TYPE == 4
    return catmullRom4x4Value(st, xFreq, yFreq, s);
#elif NOISE_TYPE == 5
    return quadratic3x3Value(st, xFreq, yFreq, s);
#elif NOISE_TYPE == 6
    return bicubicValue(st, xFreq, yFreq, s);
#elif NOISE_TYPE == 10
    float scaledTime10 = simplexValue(st, xFreq, yFreq, s + 50.0, time) * speed * 0.0025;
    return simplexValue(st, xFreq, yFreq, s, scaledTime10);
#elif NOISE_TYPE == 11
    float scaledTime11 = sineNoise(st, xFreq, yFreq, s + 50.0, time) * speed * 0.0025;
    return sineNoise(st, xFreq, yFreq, s, scaledTime11);
#else
    // NOISE_TYPE == 1 (linear) or NOISE_TYPE == 2 (hermite/cosine)
    vec2 uv = vec2(st.x * xFreq, st.y * yFreq);
    vec2 f = fract(uv);

    float x0y0 = constant(st, xFreq, yFreq, s);
    float x1y0 = constantOffset(st, xFreq, yFreq, s, ivec2(1, 0));
    float x0y1 = constantOffset(st, xFreq, yFreq, s, ivec2(0, 1));
    float x1y1 = constantOffset(st, xFreq, yFreq, s, ivec2(1, 1));

    float a = blendLinearOrCosine(x0y0, x1y0, f.x, NOISE_TYPE);
    float b = blendLinearOrCosine(x0y1, x1y1, f.x, NOISE_TYPE);

    return clamp(blendLinearOrCosine(a, b, f.y, NOISE_TYPE), 0.0, 1.0);
#endif
}

void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution.y;
    st -= vec2(aspectRatio * 0.5, 0.5);

    float xFreq = 1.0;
    float yFreq = 1.0;
#if NOISE_TYPE == 10
    xFreq = map(noiseScale, 1.0, 100.0, 1.0, 0.25);
    yFreq = xFreq * 1.5;
#elif NOISE_TYPE == 4
    xFreq = map(noiseScale, 1.0, 100.0, 1.5, 1.0);
    yFreq = xFreq * 1.5;
#else
    if (wrap) {
        xFreq = floor(map(noiseScale, 1.0, 100.0, 3.0, 2.0));
        yFreq = xFreq;
    } else {
        xFreq = map(noiseScale, 1.0, 100.0, 1.5, 1.0);
        yFreq = xFreq * 1.5;
    }
#endif

    float s = float(seed);

    // Refract values
    float xRef = value(st, xFreq, yFreq, +20.0 + s);
    float yRef = value(st, xFreq, yFreq, +10.0 + s);

    float ref = map(refractAmt, 0.0, 100.0, 0.0, 2.5);
    vec2 uv = vec2(st.x + xRef * ref, st.y + yRef * ref);

    if (colorMode == 0) {
        color.rgb = vec3(value(uv, xFreq, yFreq, s));
    } else {
        color = vec4(
            value(uv, xFreq, yFreq, s),
            value(uv, xFreq, yFreq, 10.0 + s),
            value(uv, xFreq, yFreq, 20.0 + s),
            1.0);
    }

    if (colorMode == 0) {
        // grayscale
        if (ridges) {
            color = 1.0 - abs(color * 2.0 - 1.0);
        }
    } else if (colorMode == 1) {
        // rgb
        if (ridges) {
            color = 1.0 - abs(color * 2.0 - 1.0);
        }
        color.rgb = rgb2hsv(color.rgb);
        color.r += 1.0 - (hueRotation / 360.0);
        color.r = fract(color.r);
        color.rgb = hsv2rgb(color.rgb);
    } else if (colorMode == 2) {
        // hsv
        color.r = color.r * hueRange * 0.01;
        color.r += 1.0 - (hueRotation / 360.0);
        if (ridges) {
            color.b = 1.0 - abs(color.b * 2.0 - 1.0);
        }
        color.rgb = hsv2rgb(color.rgb);
    } else {
        // oklab
        color.g = color.g * -.509 + .276;
        color.b = color.b * -.509 + .198;

        color.rgb = linear_srgb_from_oklab(color.rgb);
        color.rgb = linearToSrgb(color.rgb);
        color.rgb = rgb2hsv(color.rgb);
        color.r += 1.0 - (hueRotation / 360.0);
        color.r = fract(color.r);
        if (ridges) {
            color.b = 1.0 - abs(color.b * 2.0 - 1.0);
        }
        color.rgb = hsv2rgb(color.rgb);
    }

    color.rgb = brightnessContrast(color.rgb);
    color.a = 1.0;

    fragColor = color;
}
