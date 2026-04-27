/*
 * Julia set explorer — state-of-the-art
 *
 * Grayscale value output [0,1]. Alpha = 1.0 (synth effect).
 * Iteration: z = z² + c, z₀ = pixel, c = Julia constant.
 * Derivative: dz/dz₀ for distance estimation (no +1 term — c is constant).
 *
 * All coordinate and iteration math uses df64 (double-float emulation).
 * Single iteration loop computes all output values simultaneously.
 * Output mode selects which value to emit.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;

uniform float cReal;
uniform float cImag;
uniform int poi;
uniform int outputMode;

uniform float centerX;
uniform float centerY;
uniform float rotation;

uniform int iterations;
uniform float stripeFreq;
uniform int trapShape;
uniform float lightAngle;

uniform int cPath;
uniform float cSpeed;
uniform float cRadius;
uniform bool invert;

uniform float zoomSpeed;
uniform float zoomDepth;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float BAILOUT = 256.0;
const float LOG2 = 0.6931471805599453;

// ============================================================================
// POI c-values (famous Julia sets)
// ============================================================================

vec2 getPOI(int idx) {
    if (idx == 1) return vec2(-0.123, 0.745);       // Douady's rabbit
    if (idx == 2) return vec2(-0.3905, 0.5868);      // Siegel disk
    if (idx == 3) return vec2(0.0, 1.0);             // Dendrite
    if (idx == 4) return vec2(-1.0, 0.0);            // Basilica
    if (idx == 5) return vec2(-0.7455, 0.1130);      // Spiral galaxy
    if (idx == 6) return vec2(-0.0986, 0.6534);      // Lightning
    if (idx == 7) return vec2(-0.8, 0.156);          // Dragon curve
    if (idx == 8) return vec2(-0.75, 0.0);           // San Marco
    if (idx == 9) return vec2(-0.5792, 0.5385);      // Starfish
    if (idx == 10) return vec2(0.28, 0.008);         // Double spiral
    return vec2(-0.123, 0.745);                       // fallback
}

// ============================================================================
// Animated c-paths
// ============================================================================

vec2 getAnimatedC(int pathType, float t, float radius) {
    float theta = t * TAU;
    if (pathType == 1) {
        return vec2(cos(theta) * 0.5 - cos(2.0 * theta) * 0.25,
                    sin(theta) * 0.5 - sin(2.0 * theta) * 0.25);
    }
    if (pathType == 2) {
        return vec2(cos(theta), sin(theta)) * radius;
    }
    if (pathType == 3) {
        return vec2(-1.0 + cos(theta) * 0.25, sin(theta) * 0.25);
    }
    return vec2(0.0);
}

// ============================================================================
// Complex multiply
// ============================================================================

vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// ============================================================================
// Double-float emulation (df64) — two float32s = ~15 decimal digits
// ============================================================================

vec2 df64_from(float a) {
    return vec2(a, 0.0);
}

vec2 df64_add(vec2 a, vec2 b) {
    float s = a.x + b.x;
    float v = s - a.x;
    float e = (a.x - (s - v)) + (b.x - v);
    return vec2(s, e + a.y + b.y);
}

vec2 df64_sub(vec2 a, vec2 b) {
    return df64_add(a, vec2(-b.x, -b.y));
}

// Dekker's split: exact split of float into hi/lo parts
const float df64_split_const = 4097.0; // 2^12 + 1
void df64_split(float a, out float hi, out float lo) {
    float t = df64_split_const * a;
    hi = t - (t - a);
    lo = a - hi;
}

vec2 df64_mul(vec2 a, vec2 b) {
    float p = a.x * b.x;
    float ahi, alo, bhi, blo;
    df64_split(a.x, ahi, alo);
    df64_split(b.x, bhi, blo);
    float e = ((ahi * bhi - p) + ahi * blo + alo * bhi) + alo * blo;
    e += a.x * b.y + a.y * b.x;
    return vec2(p, e);
}

vec2 df64_mul_f(vec2 a, float b) {
    float p = a.x * b;
    float ahi, alo, bhi, blo;
    df64_split(a.x, ahi, alo);
    df64_split(b, bhi, blo);
    float e = ((ahi * bhi - p) + ahi * blo + alo * bhi) + alo * blo;
    e += a.y * b;
    return vec2(p, e);
}

// ============================================================================
// Resolve c-value from POI/path/manual
// ============================================================================

vec2 resolveC() {
    if (poi > 0) return getPOI(poi);
    if (cPath > 0) return getAnimatedC(cPath, time * cSpeed, cRadius);
    return vec2(cReal, cImag);
}

// ============================================================================
// df64 coordinate transform
// ============================================================================

void transformCoords(vec2 fragCoord, float zm,
                     out vec2 reDF, out vec2 imDF) {
    vec2 uv = (fragCoord - 0.5 * fullResolution) / min(fullResolution.x, fullResolution.y);
    float angle = -rotation * TAU / 360.0;
    float cs = cos(angle);
    float sn = sin(angle);
    uv = mat2(cs, -sn, sn, cs) * uv;

    float scale = 2.5 / zm;
    reDF = df64_add(df64_mul_f(df64_from(uv.x), scale), df64_from(centerX));
    imDF = df64_add(df64_mul_f(df64_from(uv.y), scale), df64_from(centerY));
}

// ============================================================================
// Unified Julia iteration — df64 z-iteration, all output values in one loop
// ============================================================================

struct JuliaResult {
    float iter;
    float zMag2;
    float dzMag2;
    float stripeSum;
    float stripeCount;
    float stripeLast;
    float trapMin;
};

JuliaResult juliaIterate(vec2 z0Re, vec2 z0Im, vec2 c, int maxIter,
                         float freq, int trap) {
    JuliaResult r;
    vec2 zRe = z0Re;
    vec2 zIm = z0Im;
    vec2 dz = vec2(1.0, 0.0);
    float i = 0.0;
    float stripeSum = 0.0;
    float stripeLast = 0.0;
    float stripeCount = 0.0;
    float trapMin = 1e10;
    float bail2 = BAILOUT * BAILOUT;

    vec2 zSlow = vec2(z0Re.x, z0Im.x);
    int period = 0;

    for (int n = 0; n < 1000; n++) {
        if (n >= maxIter) break;

        // Derivative: dz = 2*z*dz (float32 using hi parts)
        vec2 zF = vec2(zRe.x, zIm.x);
        dz = 2.0 * cmul(zF, dz);

        // Iteration: z = z² + c in df64
        vec2 zRe2 = df64_mul(zRe, zRe);
        vec2 zIm2 = df64_mul(zIm, zIm);
        vec2 zReIm = df64_mul(zRe, zIm);

        zRe = df64_add(df64_sub(zRe2, zIm2), df64_from(c.x));
        zIm = df64_add(df64_mul_f(zReIm, 2.0), df64_from(c.y));

        // Bailout check (float32 hi parts)
        float zMag2 = zRe.x * zRe.x + zIm.x * zIm.x;
        if (zMag2 > bail2) break;

        i += 1.0;

        // Stripe average accumulation (float32 from hi parts)
        vec2 zHi = vec2(zRe.x, zIm.x);
        if (freq > 0.0) {
            stripeLast = 0.5 * sin(freq * atan(zHi.y, zHi.x)) + 0.5;
            stripeSum += stripeLast;
            stripeCount += 1.0;
        }

        // Orbit trap accumulation
        float td;
        if (trap == 0) {
            td = length(zHi);
        } else if (trap == 1) {
            td = min(abs(zHi.x), abs(zHi.y));
        } else {
            td = abs(length(zHi) - 1.0);
        }
        trapMin = min(trapMin, td);

        // Period detection
        period++;
        if (period == 20) {
            period = 0;
            zSlow = zHi;
        } else if (distance(zHi, zSlow) < 1e-10) {
            i = float(maxIter);
            break;
        }
    }

    r.iter = i;
    r.zMag2 = zRe.x * zRe.x + zIm.x * zIm.x;
    r.dzMag2 = dot(dz, dz);
    r.stripeSum = stripeSum;
    r.stripeCount = stripeCount;
    r.stripeLast = stripeLast;
    r.trapMin = trapMin;
    return r;
}

// ============================================================================
// Output extraction from unified result
// ============================================================================

float outputSmoothIteration(JuliaResult r, float maxIter) {
    if (r.iter >= maxIter) return 0.0;
    float log_zn = log(r.zMag2) * 0.5;
    float nu = log(log_zn / LOG2) / LOG2;
    return clamp((r.iter + 1.0 - nu) / maxIter, 0.0, 1.0);
}

float outputDistanceEstimation(JuliaResult r, float maxIter) {
    if (r.iter >= maxIter) return 0.0;
    float zMag = sqrt(r.zMag2);
    float dzMag = sqrt(r.dzMag2);
    if (dzMag < 1e-10) return 0.0;
    float dist = 2.0 * zMag * log(zMag) / dzMag;
    return clamp(log(dist + 1.0) * 2.0, 0.0, 1.0);
}

float outputStripeAverage(JuliaResult r, float maxIter) {
    if (r.iter >= maxIter) return 0.0;
    if (r.stripeCount < 1.0) return 0.0;
    float avg = r.stripeSum / r.stripeCount;
    float prevAvg = (r.stripeCount > 1.0) ? (r.stripeSum - r.stripeLast) / (r.stripeCount - 1.0) : avg;
    float log_zn = log(r.zMag2) * 0.5;
    float nu = log(log_zn / LOG2) / LOG2;
    float frac = clamp(1.0 - nu + floor(nu), 0.0, 1.0);
    return clamp(mix(prevAvg, avg, frac), 0.0, 1.0);
}

float outputOrbitTrap(JuliaResult r, float maxIter) {
    if (r.iter >= maxIter) return 0.0;
    return clamp(1.0 - r.trapMin, 0.0, 1.0);
}

// ============================================================================
// Normal map — runs iteration 3 times for finite differences
// ============================================================================

float iterateSmooth(vec2 fragCoord, vec2 c, int maxIter, float zm) {
    vec2 reDF, imDF;
    transformCoords(fragCoord, zm, reDF, imDF);

    vec2 zRe = reDF;
    vec2 zIm = imDF;
    float i = 0.0;
    float bail2 = BAILOUT * BAILOUT;

    for (int n = 0; n < 1000; n++) {
        if (n >= maxIter) break;

        vec2 zRe2 = df64_mul(zRe, zRe);
        vec2 zIm2 = df64_mul(zIm, zIm);
        vec2 zReIm = df64_mul(zRe, zIm);

        zRe = df64_add(df64_sub(zRe2, zIm2), df64_from(c.x));
        zIm = df64_add(df64_mul_f(zReIm, 2.0), df64_from(c.y));

        float zMag2 = zRe.x * zRe.x + zIm.x * zIm.x;
        if (zMag2 > bail2) break;
        i += 1.0;
    }

    if (i >= float(maxIter)) return 0.0;
    float zMag2 = zRe.x * zRe.x + zIm.x * zIm.x;
    float log_zn = log(zMag2) * 0.5;
    float nu = log(log_zn / LOG2) / LOG2;
    return clamp((i + 1.0 - nu) / float(maxIter), 0.0, 1.0);
}

float outputNormalMap(vec2 fragCoord, vec2 c, int maxIter, float angle, float zm) {
    float d0 = iterateSmooth(fragCoord, c, maxIter, zm);
    float d1 = iterateSmooth(fragCoord + vec2(1.0, 0.0), c, maxIter, zm);
    float d2 = iterateSmooth(fragCoord + vec2(0.0, 1.0), c, maxIter, zm);

    vec3 normal = normalize(vec3(d1 - d0, d2 - d0, 0.05));
    float rad = angle * TAU / 360.0;
    vec3 lightDir = normalize(vec3(cos(rad), sin(rad), 0.7));
    return clamp(max(dot(normal, lightDir), 0.0), 0.0, 1.0);
}

// ============================================================================
// Main
// ============================================================================

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 c = resolveC();

    // Zoom: sinusoidal when animated, static pow(10, depth) when not
    float effectiveZoom;
    if (zoomSpeed > 0.0) {
        float phase = 0.5 * (1.0 - cos(time * zoomSpeed * TAU));
        effectiveZoom = pow(10.0, zoomDepth * phase);
    } else {
        effectiveZoom = pow(10.0, zoomDepth);
    }

    float value;

    if (outputMode == 4) {
        value = outputNormalMap(globalCoord, c, iterations, lightAngle, effectiveZoom);
    } else {
        vec2 reDF, imDF;
        transformCoords(globalCoord, effectiveZoom, reDF, imDF);
        JuliaResult r = juliaIterate(reDF, imDF, c, iterations, stripeFreq, trapShape);

        if (outputMode == 0) {
            value = outputSmoothIteration(r, float(iterations));
        } else if (outputMode == 1) {
            value = outputDistanceEstimation(r, float(iterations));
        } else if (outputMode == 2) {
            value = outputStripeAverage(r, float(iterations));
        } else if (outputMode == 3) {
            value = outputOrbitTrap(r, float(iterations));
        } else {
            value = outputSmoothIteration(r, float(iterations));
        }
    }

    if (invert) {
        value = 1.0 - value;
    }

    fragColor = vec4(vec3(value), 1.0);
}
