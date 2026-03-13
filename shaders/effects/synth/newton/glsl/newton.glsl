/*
 * Newton fractal explorer
 *
 * Newton-Raphson root finding for z^n - 1 with:
 * - Continuous fractional degree (3.0-8.0)
 * - Real-valued relaxation (Nova generalization)
 * - df64 emulated double-precision for deep zoom (~10^14)
 * - Time-driven animation with golden ratio phase decoherence
 * - Pre-baked points of interest
 * - Three grayscale output modes
 *
 * All iteration runs in df64 complex arithmetic.
 * z^n computed via repeated df64 complex multiplication.
 * Fractional degrees are floored to nearest integer for root finding.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform vec2 resolution;
uniform float time;
uniform float degree;
uniform float relaxation;
uniform float iterations;
uniform float tolerance;
uniform float poi;
uniform float centerHiX;
uniform float centerHiY;
uniform float centerLoX;
uniform float centerLoY;
uniform float zoomSpeed;
uniform float zoomDepth;
uniform float degreeSpeed;
uniform float degreeRange;
uniform float relaxSpeed;
uniform float relaxRange;
uniform float outputMode;
uniform float invert;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float PHI = 1.6180339887;

// ============================================================================
// df64 emulated double-precision
// Based on Dekker/Knuth error-free transformations.
// Two float32s (hi, lo) represent hi + lo with ~15 digits of precision.
// ============================================================================

vec2 df64_quick_two_sum(float a, float b) {
    float s = a + b;
    float e = b - (s - a);
    return vec2(s, e);
}

vec2 df64_two_sum(float a, float b) {
    float s = a + b;
    float v = s - a;
    float e = (a - (s - v)) + (b - v);
    return vec2(s, e);
}

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

vec2 df64_add(vec2 a, vec2 b) {
    vec2 s = df64_two_sum(a.x, b.x);
    s.y += a.y + b.y;
    return df64_quick_two_sum(s.x, s.y);
}

vec2 df64_sub(vec2 a, vec2 b) {
    return df64_add(a, vec2(-b.x, -b.y));
}

vec2 df64_mul(vec2 a, vec2 b) {
    vec2 p = df64_two_prod(a.x, b.x);
    p.y += a.x * b.y + a.y * b.x;
    return df64_quick_two_sum(p.x, p.y);
}

vec2 df64_mul_f(vec2 a, float b) {
    vec2 p = df64_two_prod(a.x, b);
    p.y += a.y * b;
    return df64_quick_two_sum(p.x, p.y);
}

vec2 df64_from(float a) {
    return vec2(a, 0.0);
}

float df64_to_float(vec2 a) {
    return a.x + a.y;
}

// ============================================================================
// df64 complex multiply: (ar+ai*i) * (br+bi*i)
// ============================================================================

void df64_cmul(vec2 ar, vec2 ai, vec2 br, vec2 bi, out vec2 rr, out vec2 ri) {
    rr = df64_sub(df64_mul(ar, br), df64_mul(ai, bi));
    ri = df64_add(df64_mul(ar, bi), df64_mul(ai, br));
}

// ============================================================================
// df64 coordinate transform
// ============================================================================

void transformCoords_df64(vec2 fragCoord, vec2 cX_df, vec2 cY_df, float z_zoom,
                          out vec2 re_df, out vec2 im_df) {
    vec2 uv = (fragCoord - 0.5 * resolution) / min(resolution.x, resolution.y);
    float scale = 2.5 / z_zoom;
    vec2 uv_re_df = df64_mul_f(df64_from(uv.x), scale);
    vec2 uv_im_df = df64_mul_f(df64_from(uv.y), scale);
    re_df = df64_add(uv_re_df, cX_df);
    im_df = df64_add(uv_im_df, cY_df);
}

// ============================================================================
// Points of interest
// ============================================================================

struct POIData {
    vec4 center;
    float deg;
    float maxZoom;
};

POIData getPOI(int idx) {
    // center = vec4(hiX, hiY, loX, loY), deg, maxZoom
    // Origin POIs: df64 center is exact (0,0), maxZoom=7 (pixel coord precision limit)
    // Non-origin POIs: df64 split provides ~14 digits
    if (idx == 1) return POIData(vec4(0.0, 0.0, 0.0, 0.0), 3.0, 7.0);           // triplePoint3
    if (idx == 2) return POIData(vec4(0.25, 0.4330126941204071, 0.0, 7.7718e-9), 3.0, 14.0); // spiralJunction3 = (0.25, sqrt(3)/4)
    if (idx == 3) return POIData(vec4(0.0, 0.0, 0.0, 0.0), 5.0, 7.0);           // starCenter5
    if (idx == 4) return POIData(vec4(0.6545084714889526, 0.4755282700061798, 2.5699e-8, -1.1859e-8), 5.0, 14.0); // pentaSpiral5
    if (idx == 5) return POIData(vec4(0.0, 0.0, 0.0, 0.0), 6.0, 7.0);           // hexWeb6
    if (idx == 6) return POIData(vec4(0.0, 0.0, 0.0, 0.0), 8.0, 7.0);           // octoFlower8
    return POIData(vec4(0.0), 3.0, 7.0);
}

// ============================================================================
// Main
// ============================================================================

void main() {
    int maxIter = int(iterations);
    int poiIdx = int(poi);
    int outMode = int(outputMode);
    bool doInvert = invert > 0.5;

    // --- Effective parameters with animation ---

    float effDegree = degree;
    if (degreeSpeed > 0.0 && degreeRange > 0.0) {
        effDegree += degreeRange * sin(time * degreeSpeed * TAU);
        effDegree = clamp(effDegree, 3.0, 8.0);
    }

    float effRelax = relaxation;
    if (relaxSpeed > 0.0 && relaxRange > 0.0) {
        effRelax += relaxRange * sin(time * relaxSpeed * TAU * PHI);
        effRelax = clamp(effRelax, 0.5, 2.0);
    }

    // --- Center and zoom ---

    vec2 cHi, cLo;
    float effZoomDepth = zoomDepth;

    if (poiIdx > 0) {
        POIData p = getPOI(poiIdx);
        cHi = p.center.xy;
        cLo = p.center.zw;
        effDegree = p.deg;
        effZoomDepth = min(zoomDepth, p.maxZoom);
    } else {
        cHi = vec2(centerHiX, centerHiY);
        cLo = vec2(centerLoX, centerLoY);
    }

    // Sinusoidal zoom: time 0 = zoomed out, time 0.5/speed = max depth, time 1/speed = zoomed out
    float zoom;
    if (zoomSpeed > 0.0) {
        float zoomPhase = 0.5 * (1.0 - cos(time * zoomSpeed * TAU));
        zoom = pow(10.0, effZoomDepth * zoomPhase);
    } else {
        zoom = pow(10.0, effZoomDepth);
    }

    // --- df64 coordinate transform ---

    vec2 re_df, im_df;
    transformCoords_df64(gl_FragCoord.xy, vec2(cHi.x, cLo.x), vec2(cHi.y, cLo.y),
                         zoom, re_df, im_df);

    // --- Compute roots of z^n - 1 ---

    int intDeg = int(floor(effDegree));
    int numRoots = intDeg;
    vec2 roots[8];
    for (int k = 0; k < 8; k++) {
        if (k >= numRoots) break;
        float angle = TAU * float(k) / float(intDeg);
        roots[k] = vec2(cos(angle), sin(angle));
    }

    // --- df64 Newton iteration ---

    float iter = 0.0;
    int convergedRoot = -1;
    float convergeDist = 1.0;
    float bailout = 1e10 * effRelax;

    vec2 zr_df = re_df;
    vec2 zi_df = im_df;

    for (int n = 0; n < 500; n++) {
        if (n >= maxIter) break;

        // Compute z^(intDeg-1) via repeated df64 complex multiplication
        vec2 pwr = df64_from(1.0);
        vec2 pwi = df64_from(0.0);
        for (int j = 0; j < 7; j++) {
            if (j >= intDeg - 1) break;
            vec2 tr, ti;
            df64_cmul(pwr, pwi, zr_df, zi_df, tr, ti);
            pwr = tr;
            pwi = ti;
        }

        // z^intDeg = z^(intDeg-1) * z
        vec2 znr, zni;
        df64_cmul(pwr, pwi, zr_df, zi_df, znr, zni);

        // f(z) = z^n - 1
        vec2 fzr = df64_sub(znr, df64_from(1.0));
        vec2 fzi = zni;

        // f'(z) = n * z^(n-1)
        vec2 fpzr = df64_mul_f(pwr, float(intDeg));
        vec2 fpzi = df64_mul_f(pwi, float(intDeg));

        // Degenerate derivative guard
        float fpzr_f = df64_to_float(fpzr);
        float fpzi_f = df64_to_float(fpzi);
        if (fpzr_f * fpzr_f + fpzi_f * fpzi_f < 1e-20) break;

        // delta = f(z) / f'(z) via df64 complex division
        float denom = fpzr_f * fpzr_f + fpzi_f * fpzi_f;
        float inv_denom = 1.0 / denom;
        vec2 nr = df64_add(df64_mul(fzr, fpzr), df64_mul(fzi, fpzi));
        vec2 ni = df64_sub(df64_mul(fzi, fpzr), df64_mul(fzr, fpzi));
        vec2 dr = df64_mul_f(nr, inv_denom);
        vec2 di = df64_mul_f(ni, inv_denom);

        // z = z - relaxation * delta
        zr_df = df64_sub(zr_df, df64_mul_f(dr, effRelax));
        zi_df = df64_sub(zi_df, df64_mul_f(di, effRelax));

        // Divergence check
        float zx = df64_to_float(zr_df);
        float zy = df64_to_float(zi_df);
        if (zx * zx + zy * zy > bailout) break;

        // Convergence check against roots
        for (int k = 0; k < 8; k++) {
            if (k >= numRoots) break;
            float dx = zx - roots[k].x;
            float dy = zy - roots[k].y;
            float d = sqrt(dx * dx + dy * dy);
            if (d < tolerance) {
                convergedRoot = k;
                convergeDist = d;
                break;
            }
        }
        if (convergedRoot >= 0) break;

        iter += 1.0;
    }

    // --- Smooth iteration count ---

    float smoothIter = iter;
    if (convergedRoot >= 0 && convergeDist > 0.0 && convergeDist < tolerance) {
        smoothIter = iter - log2(log(convergeDist) / log(tolerance));
    }

    // --- Output mapping ---

    float value = 0.0;
    float maxIterF = float(maxIter);
    float numRootsF = float(numRoots);

    if (outMode == 0) {
        value = smoothIter / maxIterF;
    } else if (outMode == 1) {
        if (convergedRoot >= 0) {
            value = float(convergedRoot) / numRootsF;
        }
    } else {
        if (convergedRoot >= 0) {
            value = (float(convergedRoot) + smoothIter / maxIterF) / numRootsF;
        }
    }

    if (doInvert) value = 1.0 - value;

    fragColor = vec4(vec3(value), 1.0);
}
