/*
 * Newton fractal explorer (WGSL)
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

struct Uniforms {
    data: array<vec4<f32>, 6>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const PHI: f32 = 1.6180339887;

// ============================================================================
// df64 emulated double-precision
// ============================================================================

fn df64_quick_two_sum(a: f32, b: f32) -> vec2<f32> {
    let s = a + b;
    let e = b - (s - a);
    return vec2<f32>(s, e);
}

fn df64_two_sum(a: f32, b: f32) -> vec2<f32> {
    let s = a + b;
    let v = s - a;
    let e = (a - (s - v)) + (b - v);
    return vec2<f32>(s, e);
}

fn df64_two_prod(a: f32, b: f32) -> vec2<f32> {
    let p = a * b;
    let ca = 4097.0 * a;
    let ah = ca - (ca - a);
    let al = a - ah;
    let cb = 4097.0 * b;
    let bh = cb - (cb - b);
    let bl = b - bh;
    let e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    return vec2<f32>(p, e);
}

fn df64_add(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    var s = df64_two_sum(a.x, b.x);
    s.y = s.y + a.y + b.y;
    return df64_quick_two_sum(s.x, s.y);
}

fn df64_sub(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return df64_add(a, vec2<f32>(-b.x, -b.y));
}

fn df64_mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    var p = df64_two_prod(a.x, b.x);
    p.y = p.y + a.x * b.y + a.y * b.x;
    return df64_quick_two_sum(p.x, p.y);
}

fn df64_mul_f(a: vec2<f32>, b: f32) -> vec2<f32> {
    var p = df64_two_prod(a.x, b);
    p.y = p.y + a.y * b;
    return df64_quick_two_sum(p.x, p.y);
}

fn df64_from(a: f32) -> vec2<f32> {
    return vec2<f32>(a, 0.0);
}

fn df64_to_float(a: vec2<f32>) -> f32 {
    return a.x + a.y;
}

// ============================================================================
// df64 complex multiply
// ============================================================================

struct Df64Complex {
    re: vec2<f32>,
    im: vec2<f32>,
}

fn df64_cmul(a: Df64Complex, b: Df64Complex) -> Df64Complex {
    let rr = df64_sub(df64_mul(a.re, b.re), df64_mul(a.im, b.im));
    let ri = df64_add(df64_mul(a.re, b.im), df64_mul(a.im, b.re));
    return Df64Complex(rr, ri);
}

// ============================================================================
// df64 coordinate transform
// ============================================================================

struct CoordResult {
    re: vec2<f32>,
    im: vec2<f32>,
}

fn transformCoords_df64(fragCoord: vec2<f32>, cX_df: vec2<f32>, cY_df: vec2<f32>,
                        res: vec2<f32>, z_zoom: f32, rot: f32) -> CoordResult {
    var uv = (fragCoord - 0.5 * res) / min(res.x, res.y);
    let angle = -rot * TAU / 360.0;
    let c = cos(angle);
    let s = sin(angle);
    uv = vec2<f32>(c * uv.x + s * uv.y, -s * uv.x + c * uv.y);
    let scale = 2.5 / z_zoom;
    let uv_re_df = df64_mul_f(df64_from(uv.x), scale);
    let uv_im_df = df64_mul_f(df64_from(uv.y), scale);
    let re = df64_add(uv_re_df, cX_df);
    let im = df64_add(uv_im_df, cY_df);
    return CoordResult(re, im);
}

// ============================================================================
// Points of interest
// ============================================================================

struct POIData {
    center: vec4<f32>,
    deg: f32,
    maxZoom: f32,
}

fn getPOI(idx: i32) -> POIData {
    // center = vec4(hiX, hiY, loX, loY), deg, maxZoom
    // Origin POIs: maxZoom=7 (pixel coord precision limit)
    // Non-origin POIs: df64 split provides ~14 digits
    if (idx == 1) { return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 3.0, 7.0); }           // triplePoint3
    if (idx == 2) { return POIData(vec4<f32>(0.25, 0.4330126941204071, 0.0, 7.7718e-9), 3.0, 14.0); } // spiralJunction3
    if (idx == 3) { return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 5.0, 7.0); }           // starCenter5
    if (idx == 4) { return POIData(vec4<f32>(0.6545084714889526, 0.4755282700061798, 2.5699e-8, -1.1859e-8), 5.0, 14.0); } // pentaSpiral5
    if (idx == 5) { return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 6.0, 7.0); }           // hexWeb6
    if (idx == 6) { return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 8.0, 7.0); }           // octoFlower8
    return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 3.0, 7.0);
}

// ============================================================================
// Main
// ============================================================================

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // Unpack uniforms
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;
    let degree = uniforms.data[0].w;

    let relaxation = uniforms.data[1].x;
    let iterations = uniforms.data[1].y;
    let toleranceU = uniforms.data[1].z;
    let poiU = uniforms.data[1].w;

    let centerHiX = uniforms.data[2].x;
    let centerHiY = uniforms.data[2].y;
    let centerLoX = uniforms.data[2].z;
    let centerLoY = uniforms.data[2].w;

    let zoomSpeed = uniforms.data[3].x;
    let zoomDepthU = uniforms.data[3].y;
    let degreeSpeed = uniforms.data[3].z;
    let degreeRangeU = uniforms.data[3].w;

    let relaxSpeed = uniforms.data[4].x;
    let relaxRangeU = uniforms.data[4].y;
    let rotationU = uniforms.data[4].z;
    let outputMode = uniforms.data[5].x;
    let invertU = uniforms.data[5].y;

    let maxIter = i32(iterations);
    let poiIdx = i32(poiU);
    let outMode = i32(outputMode);
    let doInvert = invertU > 0.5;

    // --- Effective parameters with animation ---

    var effDegree = degree;
    if (degreeSpeed > 0.0 && degreeRangeU > 0.0) {
        effDegree = effDegree + degreeRangeU * sin(time * degreeSpeed * TAU);
        effDegree = clamp(effDegree, 3.0, 8.0);
    }

    var effRelax = relaxation;
    if (relaxSpeed > 0.0 && relaxRangeU > 0.0) {
        effRelax = effRelax + relaxRangeU * sin(time * relaxSpeed * TAU * PHI);
        effRelax = clamp(effRelax, 0.5, 2.0);
    }

    // --- Center and zoom ---

    var cHi = vec2<f32>(centerHiX, centerHiY);
    var cLo = vec2<f32>(centerLoX, centerLoY);
    var effZoomDepth = zoomDepthU;

    if (poiIdx > 0) {
        let p = getPOI(poiIdx);
        cHi = p.center.xy + cHi;
        cLo = p.center.zw + cLo;
        effDegree = p.deg;
        effZoomDepth = min(zoomDepthU, p.maxZoom);
    }

    // Sinusoidal zoom: time 0 = zoomed out, time 0.5/speed = max depth, time 1/speed = zoomed out
    var zoom: f32;
    if (zoomSpeed > 0.0) {
        let zoomPhase = 0.5 * (1.0 - cos(time * zoomSpeed * TAU));
        zoom = pow(10.0, effZoomDepth * zoomPhase);
    } else {
        zoom = pow(10.0, effZoomDepth);
    }

    // --- df64 coordinate transform ---

    let coords = transformCoords_df64(pos.xy,
        vec2<f32>(cHi.x, cLo.x), vec2<f32>(cHi.y, cLo.y),
        resolution, zoom, rotationU);

    // --- Compute roots of z^n - 1 ---

    let intDeg = i32(floor(effDegree));
    let numRoots = intDeg;
    var roots: array<vec2<f32>, 8>;
    for (var k: i32 = 0; k < 8; k = k + 1) {
        if (k >= numRoots) { break; }
        let angle = TAU * f32(k) / f32(intDeg);
        roots[k] = vec2<f32>(cos(angle), sin(angle));
    }

    // --- df64 Newton iteration ---

    var iter: f32 = 0.0;
    var convergedRoot: i32 = -1;
    var convergeDist: f32 = 1.0;
    let bailout = 1e10 * effRelax;

    var zr_df = coords.re;
    var zi_df = coords.im;

    for (var n: i32 = 0; n < 500; n = n + 1) {
        if (n >= maxIter) { break; }

        // Compute z^(intDeg-1) via repeated df64 complex multiplication
        var pw = Df64Complex(df64_from(1.0), df64_from(0.0));
        for (var j: i32 = 0; j < 7; j = j + 1) {
            if (j >= intDeg - 1) { break; }
            pw = df64_cmul(pw, Df64Complex(zr_df, zi_df));
        }

        // z^intDeg = z^(intDeg-1) * z
        let zn = df64_cmul(pw, Df64Complex(zr_df, zi_df));

        // f(z) = z^n - 1
        let fzr = df64_sub(zn.re, df64_from(1.0));
        let fzi = zn.im;

        // f'(z) = n * z^(n-1)
        let fpzr = df64_mul_f(pw.re, f32(intDeg));
        let fpzi = df64_mul_f(pw.im, f32(intDeg));

        // Degenerate derivative guard
        let fpzr_f = df64_to_float(fpzr);
        let fpzi_f = df64_to_float(fpzi);
        if (fpzr_f * fpzr_f + fpzi_f * fpzi_f < 1e-20) { break; }

        // delta = f(z) / f'(z) via df64 complex division
        let denom = fpzr_f * fpzr_f + fpzi_f * fpzi_f;
        let inv_denom = 1.0 / denom;
        let nr = df64_add(df64_mul(fzr, fpzr), df64_mul(fzi, fpzi));
        let ni = df64_sub(df64_mul(fzi, fpzr), df64_mul(fzr, fpzi));
        let dr = df64_mul_f(nr, inv_denom);
        let di = df64_mul_f(ni, inv_denom);

        // z = z - relaxation * delta
        zr_df = df64_sub(zr_df, df64_mul_f(dr, effRelax));
        zi_df = df64_sub(zi_df, df64_mul_f(di, effRelax));

        // Divergence check
        let zx = df64_to_float(zr_df);
        let zy = df64_to_float(zi_df);
        if (zx * zx + zy * zy > bailout) { break; }

        // Convergence check
        for (var ck: i32 = 0; ck < 8; ck = ck + 1) {
            if (ck >= numRoots) { break; }
            let dx = zx - roots[ck].x;
            let dy = zy - roots[ck].y;
            let d = sqrt(dx * dx + dy * dy);
            if (d < toleranceU) {
                convergedRoot = ck;
                convergeDist = d;
                break;
            }
        }
        if (convergedRoot >= 0) { break; }

        iter = iter + 1.0;
    }

    // --- Smooth iteration count ---

    var smoothIter = iter;
    if (convergedRoot >= 0 && convergeDist > 0.0 && convergeDist < toleranceU) {
        smoothIter = iter - log2(log(convergeDist) / log(toleranceU));
    }

    // --- Output mapping ---

    var value: f32 = 0.0;
    let maxIterF = f32(maxIter);
    let numRootsF = f32(numRoots);

    if (outMode == 0) {
        value = smoothIter / maxIterF;
    } else if (outMode == 1) {
        if (convergedRoot >= 0) {
            value = f32(convergedRoot) / numRootsF;
        }
    } else {
        if (convergedRoot >= 0) {
            value = (f32(convergedRoot) + smoothIter / maxIterF) / numRootsF;
        }
    }

    if (doInvert) { value = 1.0 - value; }

    return vec4<f32>(vec3<f32>(value), 1.0);
}
