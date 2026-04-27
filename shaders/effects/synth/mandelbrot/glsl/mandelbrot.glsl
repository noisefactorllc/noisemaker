/*
 * synth/mandelbrot — State-of-the-art Mandelbrot explorer
 *
 * Features:
 * - Double-float (df64) emulation for deep zoom (~10^14)
 * - Five output algorithms: smooth iteration, distance estimation,
 *   stripe average, orbit trap, normal map
 * - Curated POI zoom paths driven by engine time
 * - Cardioid + period-2 bulb early-out optimization
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;

uniform int poi;
uniform int outputMode;
uniform int iterations;
uniform float centerHiX;
uniform float centerHiY;
uniform float centerLoX;
uniform float centerLoY;

uniform float zoomSpeed;
uniform float zoomDepth;
uniform float invert;
uniform float stripeFreq;
uniform int trapShape;
uniform float lightAngle;
uniform float rotation;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float BAILOUT = 256.0;  // Large bailout for smooth coloring
const float LOG2 = 0.6931471805599453;
const int MAX_ITER = 500;

// ============================================================================
// Double-float (df64) arithmetic
// Two float32s (hi, lo) represent hi + lo with ~15 digits of precision.
// Based on Dekker/Knuth error-free transformations.
// ============================================================================

// Quick two-sum: a + b = s + e, assumes |a| >= |b|
vec2 df64_quick_two_sum(float a, float b) {
    float s = a + b;
    float e = b - (s - a);
    return vec2(s, e);
}

// Two-sum: a + b = s + e (no magnitude assumption)
vec2 df64_two_sum(float a, float b) {
    float s = a + b;
    float v = s - a;
    float e = (a - (s - v)) + (b - v);
    return vec2(s, e);
}

// Two-product: a * b = p + e using Dekker's split
// Splits each operand into high/low 12-bit halves for error-free product.
vec2 df64_two_prod(float a, float b) {
    float p = a * b;
    float ca = 4097.0 * a;
    float ah = ca - (ca - a);
    float al = a - ah;
    float cb = 4097.0 * b;
    float bh = cb - (cb - b);
    float bl = b - bh;
    float e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    return vec2(p, e);
}

// df64 + df64
vec2 df64_add(vec2 a, vec2 b) {
    vec2 s = df64_two_sum(a.x, b.x);
    s.y += a.y + b.y;
    return df64_quick_two_sum(s.x, s.y);
}

// df64 - df64
vec2 df64_sub(vec2 a, vec2 b) {
    return df64_add(a, vec2(-b.x, -b.y));
}

// df64 * df64
vec2 df64_mul(vec2 a, vec2 b) {
    vec2 p = df64_two_prod(a.x, b.x);
    p.y += a.x * b.y + a.y * b.x;
    return df64_quick_two_sum(p.x, p.y);
}

// df64 * float
vec2 df64_mul_f(vec2 a, float b) {
    vec2 p = df64_two_prod(a.x, b);
    p.y += a.y * b;
    return df64_quick_two_sum(p.x, p.y);
}

// float -> df64
vec2 df64_from(float a) {
    return vec2(a, 0.0);
}

// df64 -> float (lossy)
float df64_to_float(vec2 a) {
    return a.x + a.y;
}

// ============================================================================
// Points of Interest — encoded as shader constants
// Each POI: vec4(centerX_hi, centerX_lo, centerY_hi, centerY_lo)
// ============================================================================

// POI max zoom depths (log10 scale, based on coordinate precision)
float getPoiMaxZoom(int index) {
    if (index == 2 || index == 7) return 7.0;  // 5-8 digit coords
    if (index == 8) return 10.0;                // 10 digit coords
    return 14.0;                                // full df64 precision
}

void getPOI(int index, out vec2 cX_df, out vec2 cY_df) {
    // POI coordinates as df64 pairs (hi, lo) — verified from authoritative sources
    if (index == 1) {      // seahorseValley — MROB embedded Julia nucleus (18 digits)
        cX_df = vec2(-0.7445398569107056, -3.4452027897e-9);
        cY_df = vec2( 0.12172377109527588, 2.7991489404e-9);
    } else if (index == 2) { // elephantValley — MROB (5 digits)
        cX_df = vec2( 0.29833000898361206, -8.9836120765e-9);
        cY_df = vec2( 0.0011099999537691474, 4.6230852696e-11);
    } else if (index == 3) { // scepterValley — period-3 nucleus (exact)
        cX_df = vec2(-1.7548776865005493, 2.0253856592e-8);
        cY_df = vec2( 0.0, 0.0);
    } else if (index == 4) { // miniBrot — fractaljourney verified (16 digits)
        cX_df = vec2(-1.7400623559951782, -2.6584161761e-8);
        cY_df = vec2( 0.028175339102745056, 6.7646594229e-10);
    } else if (index == 5) { // feigenbaum — Myrberg-Feigenbaum constant
        cX_df = vec2(-1.4011552333831787, 4.4291128098e-8);
        cY_df = vec2( 0.0, 0.0);
    } else if (index == 6) { // birdOfParadise — superliminal verified (16 digits)
        cX_df = vec2( 0.37500011920928955, 8.5257595428e-10);
        cY_df = vec2(-0.21663938462734222, -3.8103704636e-9);
    } else if (index == 7) { // spiralGalaxy — MROB seahorse double hook (8 digits)
        cX_df = vec2(-0.7445389032363892, -1.6763610833e-8);
        cY_df = vec2( 0.12172418087720871, -8.7720870845e-10);
    } else if (index == 8) { // doubleSpiral — MROB seahorse medallion (10 digits)
        cX_df = vec2(-1.2553445100784302, -1.4721569741e-8);
        cY_df = vec2(-0.3822004497051239, -1.3294876089e-8);
    } else {                 // manual — use uniform values
        cX_df = vec2(centerHiX, centerLoX);  cY_df = vec2(centerHiY, centerLoY);
    }
}

// ============================================================================
// Coordinate transform
// ============================================================================

// df64 transform: returns (re_hi, re_lo, im_hi, im_lo)
void transformCoords_df64(vec2 fragCoord, vec2 cX_df, vec2 cY_df, float z, float rot,
                          out vec2 re_df, out vec2 im_df) {
    vec2 uv = (fragCoord - 0.5 * fullResolution) / min(fullResolution.x, fullResolution.y);

    float angle = -rot * TAU / 360.0;
    float c = cos(angle);
    float s = sin(angle);
    uv = mat2(c, -s, s, c) * uv;

    float scale = 2.5 / z;
    re_df = df64_add(df64_from(uv.x * scale), cX_df);
    im_df = df64_add(df64_from(uv.y * scale), cY_df);
}

// ============================================================================
// Cardioid and period-2 bulb tests
// ============================================================================

bool inCardioid(float x, float y) {
    float y2 = y * y;
    float q = (x - 0.25) * (x - 0.25) + y2;
    return q * (q + (x - 0.25)) <= 0.25 * y2;
}

bool inPeriod2Bulb(float x, float y) {
    float xp1 = x + 1.0;
    return xp1 * xp1 + y * y <= 0.0625;
}

// ============================================================================
// Orbit trap distance functions
// ============================================================================

float trapDistance(vec2 z, int shape) {
    if (shape == 0) {
        // Point trap (origin)
        return length(z);
    } else if (shape == 1) {
        // Cross trap (axes)
        return min(abs(z.x), abs(z.y));
    } else {
        // Circle trap (unit circle)
        return abs(length(z) - 1.0);
    }
}

// ============================================================================
// Core Mandelbrot iteration — df64 deep precision
// ============================================================================

void mandelbrot_df64(vec2 c_re, vec2 c_im, int maxIter,
                     out float smoothIter, out float rawIter,
                     out vec2 z_final, out vec2 dz_final,
                     out float stripeAcc, out float trapMin) {
    // Cardioid test using float32 approximation (good enough for early-out)
    float cx = df64_to_float(c_re);
    float cy = df64_to_float(c_im);
    if (inCardioid(cx, cy) || inPeriod2Bulb(cx, cy)) {
        smoothIter = float(maxIter);
        rawIter = float(maxIter);
        z_final = vec2(0.0);
        dz_final = vec2(0.0);
        stripeAcc = 0.0;
        trapMin = 1e20;
        return;
    }

    vec2 zr = vec2(0.0);  // z.real as df64
    vec2 zi = vec2(0.0);  // z.imag as df64
    vec2 dz = vec2(1.0, 0.0);  // derivative (float32 is fine for dz)
    float stripe = 0.0;
    float trap = 1e20;
    float i = 0.0;

    for (int n = 0; n < MAX_ITER; n++) {
        if (n >= maxIter) break;

        // Get float32 approximations for derivative and aux computations
        float zx = df64_to_float(zr);
        float zy = df64_to_float(zi);

        // Derivative (float32): dz = 2*z*dz + 1
        dz = vec2(
            2.0 * (zx * dz.x - zy * dz.y) + 1.0,
            2.0 * (zx * dz.y + zy * dz.x)
        );

        // z = z^2 + c in df64
        vec2 zr2 = df64_mul(zr, zr);       // zr * zr
        vec2 zi2 = df64_mul(zi, zi);       // zi * zi
        vec2 zri = df64_mul(zr, zi);       // zr * zi
        vec2 new_zr = df64_add(df64_sub(zr2, zi2), c_re);  // zr^2 - zi^2 + c_re
        vec2 new_zi = df64_add(df64_mul_f(zri, 2.0), c_im); // 2*zr*zi + c_im
        zr = new_zr;
        zi = new_zi;

        // Bailout using float32 approximation
        float post_zx = df64_to_float(zr);
        float post_zy = df64_to_float(zi);
        float post_mag2 = post_zx * post_zx + post_zy * post_zy;

        // Stripe + trap (float32 aux)
        if (stripeFreq > 0.0) {
            stripe += sin(stripeFreq * atan(post_zy, post_zx));
        }
        trap = min(trap, trapDistance(vec2(post_zx, post_zy), trapShape));

        if (post_mag2 > BAILOUT * BAILOUT) break;
        i += 1.0;
    }

    rawIter = i;
    float fx = df64_to_float(zr);
    float fy = df64_to_float(zi);
    z_final = vec2(fx, fy);
    dz_final = dz;
    stripeAcc = stripe;
    trapMin = trap;

    float mag2 = dot(z_final, z_final);
    if (i < float(maxIter) && mag2 > 1.0) {
        float log_zn = log(mag2) * 0.5;
        float nu = log(log_zn / LOG2) / LOG2;
        smoothIter = i + 1.0 - nu;
    } else {
        smoothIter = i;
    }
}

// ============================================================================
// Output algorithms
// ============================================================================

float outputSmoothIteration(float smoothIter, float rawIter, int maxIter) {
    if (rawIter >= float(maxIter)) return 0.0;
    return smoothIter / float(maxIter);
}

float outputDistance(vec2 z, vec2 dz, float rawIter, int maxIter) {
    if (rawIter >= float(maxIter)) return 0.0;
    float mag = length(z);
    float dmag = length(dz);
    if (dmag == 0.0) return 0.0;
    float dist = 2.0 * mag * log(mag) / dmag;
    // Log-normalize for visual range
    return clamp(sqrt(dist * float(maxIter)) * 0.5, 0.0, 1.0);
}

float outputStripeAverage(float smoothIter, float rawIter, float stripeAcc, int maxIter) {
    if (rawIter >= float(maxIter)) return 0.0;
    float count = max(rawIter, 1.0);
    float avg = stripeAcc / count;
    // Blend with smooth iteration for continuity
    float frac = smoothIter - floor(smoothIter);
    return clamp(0.5 + 0.5 * avg * (1.0 - frac), 0.0, 1.0);
}

float outputOrbitTrap(float trapMin, float rawIter, int maxIter) {
    if (rawIter >= float(maxIter)) return 0.0;
    return clamp(1.0 - trapMin * 0.5, 0.0, 1.0);
}

// ============================================================================
// Normal map (3-sample finite difference)
// ============================================================================

float computeValueAt_df64(vec2 fragCoord, vec2 cX_df, vec2 cY_df, float z_zoom, float rot, int maxIter) {
    vec2 re_df, im_df;
    transformCoords_df64(fragCoord, cX_df, cY_df, z_zoom, rot, re_df, im_df);
    float sI, rI;
    vec2 zf, dzf;
    float sa, tm;
    mandelbrot_df64(re_df, im_df, maxIter, sI, rI, zf, dzf, sa, tm);
    return outputDistance(zf, dzf, rI, maxIter);
}

float outputNormalMap(vec2 fragCoord, vec2 cX_df, vec2 cY_df,
                      float z_zoom, float rot, int maxIter, float angle) {
    float eps = 1.0 / min(fullResolution.x, fullResolution.y);
    float h0 = computeValueAt_df64(fragCoord, cX_df, cY_df, z_zoom, rot, maxIter);
    float hx = computeValueAt_df64(fragCoord + vec2(1.0, 0.0), cX_df, cY_df, z_zoom, rot, maxIter);
    float hy = computeValueAt_df64(fragCoord + vec2(0.0, 1.0), cX_df, cY_df, z_zoom, rot, maxIter);

    // Surface normal from height differences
    vec3 normal = normalize(vec3(h0 - hx, h0 - hy, eps));

    // Light direction from angle
    float rad = angle * TAU / 360.0;
    vec3 lightDir = normalize(vec3(cos(rad), sin(rad), 0.7));

    float diffuse = max(dot(normal, lightDir), 0.0);
    return clamp(diffuse, 0.0, 1.0);
}

// ============================================================================
// Effective zoom (handles POI animation)
// ============================================================================

float getEffectiveZoom(int poiIndex) {
    // Clamp zoom depth to POI coordinate precision
    float maxDepth = (poiIndex > 0) ? getPoiMaxZoom(poiIndex) : 14.0;
    float effDepth = min(zoomDepth, maxDepth);
    if (zoomSpeed > 0.0) {
        // Sinusoidal zoom: t=0 zoomed out, t=0.5/speed max depth, t=1/speed zoomed out
        float zoomPhase = 0.5 * (1.0 - cos(time * zoomSpeed * TAU));
        return pow(10.0, effDepth * zoomPhase);
    }
    return pow(10.0, effDepth);
}

// ============================================================================
// Main
// ============================================================================

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    int maxIter = min(iterations, MAX_ITER);
    float effZoom = getEffectiveZoom(poi);
    float rot = (poi > 0) ? 0.0 : rotation;

    // Resolve center coordinates (POI or manual)
    vec2 cX_df, cY_df;
    getPOI(poi, cX_df, cY_df);

    float value;

    if (outputMode == 4) {
        // Normal map: special case, needs 3 evaluations
        value = outputNormalMap(globalCoord, cX_df, cY_df,
                               effZoom, rot, maxIter, lightAngle);
    } else {
        float smoothI, rawI;
        vec2 z_final, dz_final;
        float stripeAcc, trapMin;

        vec2 re_df, im_df;
        transformCoords_df64(globalCoord, cX_df, cY_df, effZoom, rot, re_df, im_df);
        mandelbrot_df64(re_df, im_df, maxIter, smoothI, rawI, z_final, dz_final, stripeAcc, trapMin);

        if (outputMode == 0) {
            value = outputSmoothIteration(smoothI, rawI, maxIter);
        } else if (outputMode == 1) {
            value = outputDistance(z_final, dz_final, rawI, maxIter);
        } else if (outputMode == 2) {
            value = outputStripeAverage(smoothI, rawI, stripeAcc, maxIter);
        } else if (outputMode == 3) {
            value = outputOrbitTrap(trapMin, rawI, maxIter);
        } else {
            value = outputSmoothIteration(smoothI, rawI, maxIter);
        }
    }

    // Invert
    if (invert > 0.5) {
        value = 1.0 - value;
    }

    fragColor = vec4(vec3(value), 1.0);
}
