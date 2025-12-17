#version 300 es

/*
 * Caustic shader.
 * Dual-noise caustic pattern with reflect blend.
 */

precision highp float;
precision highp int;

uniform float time;
uniform float seed;
uniform bool wrap;
uniform vec2 resolution;
uniform float noiseScale;
uniform int interp;
uniform float loopAmp;
uniform float hueRotation;
uniform float hueRange;
uniform float intensity;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG - MIT License
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
    
    float c = v * s;
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

float periodicFunction(float p) {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

// Simplex 2D - MIT License
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x*34.0)+1.0)*x);
}

float simplexValue(vec2 st, float xFreq, float yFreq, float s, float blend) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);

    vec2 uv = vec2(st.x * xFreq, st.y * yFreq);
    uv.x += s;

    vec2 i  = floor(uv + dot(uv, C.yy) );
    vec2 x0 = uv -   i + dot(i, C.xx);

    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
		  + i.x + vec3(0.0, i1.x, 1.0 ));

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;

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

// Value noise
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
    uint seedBits = floatBitsToUint(seed);
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
    float scaledTime = periodicFunction(rand.x - time) * map(abs(loopAmp), 0.0, 100.0, 0.0, 0.25);
    return periodicFunction(rand.y - scaledTime);
}

float constantOffset(vec2 st, float xFreq, float yFreq, float s, ivec2 offset) {
    vec3 rand = randomFromLatticeWithOffset(st, xFreq, yFreq, s, offset);
    float scaledTime = periodicFunction(rand.x - time) * map(abs(loopAmp), 0.0, 100.0, 0.0, 0.25);
    return periodicFunction(rand.y - scaledTime);
}

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

float value(vec2 st, float xFreq, float yFreq, float s) {
    float scaledTime = 1.0;
    
    if (interp == 0) {
        return constant(st, xFreq, yFreq, s);
    }
    
    if (interp == 3) {
        return catmullRom3x3Value(st, xFreq, yFreq, s);
    }
    
    if (interp == 4) {
        return catmullRom4x4Value(st, xFreq, yFreq, s);
    }
    
    if (interp == 5) {
        return quadratic3x3Value(st, xFreq, yFreq, s);
    }
    
    if (interp == 6) {
        return bicubicValue(st, xFreq, yFreq, s);
    }
    
    if (interp == 10) {
        scaledTime = simplexValue(st, xFreq, yFreq, s + 50.0, time) * loopAmp * 0.0025;
        return simplexValue(st, xFreq, yFreq, s, scaledTime);
    }
    
    if (interp == 11) {
        scaledTime = sineNoise(st, xFreq, yFreq, s + 50.0, time) * loopAmp * 0.0025;
        return sineNoise(st, xFreq, yFreq, s, scaledTime);
    }

    vec2 uv = vec2(st.x * xFreq, st.y * yFreq);
    vec2 f = fract(uv);
    
    float x0y0 = constant(st, xFreq, yFreq, s);
    float x1y0 = constantOffset(st, xFreq, yFreq, s, ivec2(1, 0));
    float x0y1 = constantOffset(st, xFreq, yFreq, s, ivec2(0, 1));
    float x1y1 = constantOffset(st, xFreq, yFreq, s, ivec2(1, 1));

    float a = blendLinearOrCosine(x0y0, x1y0, f.x, interp);
    float b = blendLinearOrCosine(x0y1, x1y1, f.x, interp);

    return clamp(blendLinearOrCosine(a, b, f.y, interp), 0.0, 1.0);
}

vec3 noise(vec2 st, float s) {
    float freq = 1.0;
    if (interp != 10 && wrap) {
        freq = floor(map(noiseScale, 1.0, 100.0, 6.0, 2.0));
    } else {
        if (interp == 10) {
            freq = map(noiseScale, 1.0, 100.0, 1.0, 0.5);
        } else {
            freq = map(noiseScale, 1.0, 100.0, 6.0, 1.0);
        }
    }

    vec3 color = vec3(
        value(st, freq, freq, 0.0 + s),
        value(st, freq, freq, 10.0 + s),
        value(st, freq, freq, 20.0 + s));

    // hue
    color.r = color.r * hueRange * 0.01;
    color.r += 1.0 - (hueRotation / 360.0);

    // saturation
    color.g *= 0.333;

    // brightness - ridges
    color.b = 1.0 - abs(color.b * 2.0 - 1.0);

    color = hsv2rgb(color);

    return color;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution.y;
    st -= vec2(aspectRatio * 0.5, 0.5);

    vec3 leftColor = noise(st, seed);
    vec3 rightColor = noise(st, seed + 10.0);

    // "reflect" mode blend from coalesce
    vec3 left = min(leftColor * rightColor / (1.0 - rightColor * leftColor), vec3(1.0));
    vec3 right = min(rightColor * leftColor / (1.0 - leftColor * rightColor), vec3(1.0));

    color.rgb = brightnessContrast(mix(left, right, 0.5));
    color.a = 1.0;

    fragColor = color;
}
