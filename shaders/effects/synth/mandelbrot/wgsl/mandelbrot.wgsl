/*
 * synth/mandelbrot — State-of-the-art Mandelbrot explorer (WGSL)
 *
 * WGSL port of the GLSL implementation. Same algorithms:
 * df64 deep zoom, 5 output modes, POI animated zoom.
 */

struct Uniforms {
    // Slot 0: resolution.xy, time, (unused)
    // Slot 1: poi, outputMode, iterations, (unused)
    // Slot 2: centerHiX, centerHiY, centerLoX, centerLoY
    // Slot 3: zoom, zoomSpeed, zoomDepth, invert
    // Slot 4: stripeFreq, trapShape, lightAngle, rotation
    data: array<vec4<f32>, 5>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const BAILOUT: f32 = 256.0;
const LOG2: f32 = 0.6931471805599453;
const MAX_ITER: i32 = 2048;

// ============================================================================
// df64 arithmetic
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

// Dekker's split method for error-free product
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
// Points of Interest
// ============================================================================

struct PoiCoords {
    cX: vec2<f32>,
    cY: vec2<f32>,
}

fn getPoiMaxZoom(index: i32) -> f32 {
    if (index == 2 || index == 7) { return 7.0; }   // 5-8 digit coords
    if (index == 8) { return 10.0; }                  // 10 digit coords
    return 14.0;                                       // full df64 precision
}

fn getPOI(index: i32, centerHiX: f32, centerLoX: f32, centerHiY: f32, centerLoY: f32) -> PoiCoords {
    // Verified from authoritative sources (MROB, superliminal, fractaljourney)
    if (index == 1) { // seahorseValley — MROB embedded Julia nucleus
        return PoiCoords(vec2<f32>(-0.7445398569107056, -3.4452027897e-9),
                         vec2<f32>( 0.12172377109527588, 2.7991489404e-9));
    } else if (index == 2) { // elephantValley — MROB
        return PoiCoords(vec2<f32>( 0.29833000898361206, -8.9836120765e-9),
                         vec2<f32>( 0.0011099999537691474, 4.6230852696e-11));
    } else if (index == 3) { // scepterValley — period-3 nucleus
        return PoiCoords(vec2<f32>(-1.7548776865005493, 2.0253856592e-8),
                         vec2<f32>( 0.0, 0.0));
    } else if (index == 4) { // miniBrot — fractaljourney verified
        return PoiCoords(vec2<f32>(-1.7400623559951782, -2.6584161761e-8),
                         vec2<f32>( 0.028175339102745056, 6.7646594229e-10));
    } else if (index == 5) { // feigenbaum — Myrberg-Feigenbaum constant
        return PoiCoords(vec2<f32>(-1.4011552333831787, 4.4291128098e-8),
                         vec2<f32>( 0.0, 0.0));
    } else if (index == 6) { // birdOfParadise — superliminal verified
        return PoiCoords(vec2<f32>( 0.37500011920928955, 8.5257595428e-10),
                         vec2<f32>(-0.21663938462734222, -3.8103704636e-9));
    } else if (index == 7) { // spiralGalaxy — MROB seahorse double hook
        return PoiCoords(vec2<f32>(-0.7445389032363892, -1.6763610833e-8),
                         vec2<f32>( 0.12172418087720871, -8.7720870845e-10));
    } else if (index == 8) { // doubleSpiral — MROB seahorse medallion
        return PoiCoords(vec2<f32>(-1.2553445100784302, -1.4721569741e-8),
                         vec2<f32>(-0.3822004497051239, -1.3294876089e-8));
    }
    return PoiCoords(vec2<f32>(centerHiX, centerLoX), vec2<f32>(centerHiY, centerLoY));
}

// ============================================================================
// Coordinate transform
// ============================================================================

struct Df64Pair {
    re: vec2<f32>,
    im: vec2<f32>,
}

fn transformCoords_df64(fragCoord: vec2<f32>, resolution: vec2<f32>,
                        cX_df: vec2<f32>, cY_df: vec2<f32>,
                        z: f32, rot: f32) -> Df64Pair {
    var uv = (fragCoord - 0.5 * resolution) / min(resolution.x, resolution.y);
    let angle = -rot * TAU / 360.0;
    let c = cos(angle);
    let s = sin(angle);
    // Match GLSL mat2(c, -s, s, c) column-major rotation
    uv = vec2<f32>(c * uv.x + s * uv.y, -s * uv.x + c * uv.y);

    let scale = 2.5 / z;
    let re = df64_add(df64_from(uv.x * scale), cX_df);
    let im = df64_add(df64_from(uv.y * scale), cY_df);
    return Df64Pair(re, im);
}

// ============================================================================
// Early-out tests
// ============================================================================

fn inCardioid(x: f32, y: f32) -> bool {
    let y2 = y * y;
    let q = (x - 0.25) * (x - 0.25) + y2;
    return q * (q + (x - 0.25)) <= 0.25 * y2;
}

fn inPeriod2Bulb(x: f32, y: f32) -> bool {
    let xp1 = x + 1.0;
    return xp1 * xp1 + y * y <= 0.0625;
}

// ============================================================================
// Orbit trap
// ============================================================================

fn trapDistance(z: vec2<f32>, shape: i32) -> f32 {
    if (shape == 0) {
        return length(z);
    } else if (shape == 1) {
        return min(abs(z.x), abs(z.y));
    } else {
        return abs(length(z) - 1.0);
    }
}

// ============================================================================
// Iteration result
// ============================================================================

struct IterResult {
    smoothIter: f32,
    rawIter: f32,
    z_final: vec2<f32>,
    dz_final: vec2<f32>,
    stripeAcc: f32,
    trapMin: f32,
}

// ============================================================================
// df64 iteration — deep precision
// ============================================================================

fn mandelbrot_df64(c_re: vec2<f32>, c_im: vec2<f32>, maxIter: i32,
                   sFreq: f32, tShape: i32) -> IterResult {
    let cx = df64_to_float(c_re);
    let cy = df64_to_float(c_im);
    if (inCardioid(cx, cy) || inPeriod2Bulb(cx, cy)) {
        return IterResult(f32(maxIter), f32(maxIter), vec2<f32>(0.0), vec2<f32>(0.0), 0.0, 1e20);
    }

    var zr = vec2<f32>(0.0, 0.0);
    var zi = vec2<f32>(0.0, 0.0);
    var dz = vec2<f32>(1.0, 0.0);
    var stripe: f32 = 0.0;
    var trap: f32 = 1e20;
    var i: f32 = 0.0;

    for (var n: i32 = 0; n < MAX_ITER; n = n + 1) {
        if (n >= maxIter) { break; }

        let zx = df64_to_float(zr);
        let zy = df64_to_float(zi);

        dz = vec2<f32>(
            2.0 * (zx * dz.x - zy * dz.y) + 1.0,
            2.0 * (zx * dz.y + zy * dz.x)
        );

        let zr2 = df64_mul(zr, zr);
        let zi2 = df64_mul(zi, zi);
        let zri = df64_mul(zr, zi);
        let new_zr = df64_add(df64_sub(zr2, zi2), c_re);
        let new_zi = df64_add(df64_mul_f(zri, 2.0), c_im);
        zr = new_zr;
        zi = new_zi;

        let post_zx = df64_to_float(zr);
        let post_zy = df64_to_float(zi);
        let post_mag2 = post_zx * post_zx + post_zy * post_zy;

        stripe = stripe + sin(sFreq * atan2(post_zy, post_zx));
        trap = min(trap, trapDistance(vec2<f32>(post_zx, post_zy), tShape));

        if (post_mag2 > BAILOUT * BAILOUT) { break; }
        i = i + 1.0;
    }

    let fx = df64_to_float(zr);
    let fy = df64_to_float(zi);
    let z_final = vec2<f32>(fx, fy);

    var smoothI = i;
    let mag2 = dot(z_final, z_final);
    if (i < f32(maxIter) && mag2 > 1.0) {
        let log_zn = log(mag2) * 0.5;
        let nu = log(log_zn / LOG2) / LOG2;
        smoothI = i + 1.0 - nu;
    }

    return IterResult(smoothI, i, z_final, dz, stripe, trap);
}

// ============================================================================
// Output algorithms
// ============================================================================

fn outputSmoothIteration(smoothI: f32, rawI: f32, maxIter: i32) -> f32 {
    if (rawI >= f32(maxIter)) { return 0.0; }
    return smoothI / f32(maxIter);
}

fn outputDistance(z: vec2<f32>, dz: vec2<f32>, rawI: f32, maxIter: i32) -> f32 {
    if (rawI >= f32(maxIter)) { return 0.0; }
    let mag = length(z);
    let dmag = length(dz);
    if (dmag == 0.0) { return 0.0; }
    let dist = 2.0 * mag * log(mag) / dmag;
    return clamp(sqrt(dist * f32(maxIter)) * 0.5, 0.0, 1.0);
}

fn outputStripeAverage(smoothI: f32, rawI: f32, stripeAcc: f32, maxIter: i32) -> f32 {
    if (rawI >= f32(maxIter)) { return 0.0; }
    let count = max(rawI, 1.0);
    let avg = stripeAcc / count;
    let frac = smoothI - floor(smoothI);
    return clamp(0.5 + 0.5 * avg * (1.0 - frac), 0.0, 1.0);
}

fn outputOrbitTrap(trapMin: f32, rawI: f32, maxIter: i32) -> f32 {
    if (rawI >= f32(maxIter)) { return 0.0; }
    return clamp(1.0 - trapMin * 0.5, 0.0, 1.0);
}

// ============================================================================
// Normal map helpers
// ============================================================================

fn computeDistAt_df64(fragCoord: vec2<f32>, resolution: vec2<f32>,
                      cX_df: vec2<f32>, cY_df: vec2<f32>, z_zoom: f32, rot: f32,
                      maxIter: i32, sFreq: f32, tShape: i32) -> f32 {
    let coords = transformCoords_df64(fragCoord, resolution, cX_df, cY_df, z_zoom, rot);
    let r = mandelbrot_df64(coords.re, coords.im, maxIter, sFreq, tShape);
    return outputDistance(r.z_final, r.dz_final, r.rawIter, maxIter);
}

fn outputNormalMap(fragCoord: vec2<f32>, resolution: vec2<f32>,
                   cX_df: vec2<f32>, cY_df: vec2<f32>,
                   z_zoom: f32, rot: f32, maxIter: i32, angle: f32,
                   sFreq: f32, tShape: i32) -> f32 {
    let eps = 1.0 / min(resolution.x, resolution.y);
    let h0 = computeDistAt_df64(fragCoord, resolution, cX_df, cY_df, z_zoom, rot, maxIter, sFreq, tShape);
    let hx = computeDistAt_df64(fragCoord + vec2<f32>(1.0, 0.0), resolution, cX_df, cY_df, z_zoom, rot, maxIter, sFreq, tShape);
    let hy = computeDistAt_df64(fragCoord + vec2<f32>(0.0, 1.0), resolution, cX_df, cY_df, z_zoom, rot, maxIter, sFreq, tShape);

    let normal = normalize(vec3<f32>(h0 - hx, h0 - hy, eps));
    let rad = angle * TAU / 360.0;
    let lightDir = normalize(vec3<f32>(cos(rad), sin(rad), 0.7));
    return clamp(dot(normal, lightDir), 0.0, 1.0);
}

// ============================================================================
// Main
// ============================================================================

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;

    let poi = i32(uniforms.data[1].x);
    let outputMode = i32(uniforms.data[1].y);
    let iterations = i32(uniforms.data[1].z);

    let centerHiX = uniforms.data[2].x;
    let centerHiY = uniforms.data[2].y;
    let centerLoX = uniforms.data[2].z;
    let centerLoY = uniforms.data[2].w;

    let zoomSpeed = uniforms.data[3].x;
    let zoomDepth = uniforms.data[3].y;
    let invertVal = uniforms.data[3].z;
    let stripeFreq = uniforms.data[3].w;

    let trapShape = i32(uniforms.data[4].x);
    let lightAngle = uniforms.data[4].y;
    let rotation = uniforms.data[4].z;

    let maxIter = min(iterations, MAX_ITER);

    // Clamp zoom depth to POI coordinate precision
    let maxDepth = select(14.0, getPoiMaxZoom(poi), poi > 0);
    let effDepth = min(zoomDepth, maxDepth);
    var effZoom: f32;
    if (zoomSpeed > 0.0) {
        // Sinusoidal zoom: t=0 zoomed out, t=0.5/speed max depth, t=1/speed zoomed out
        let zoomPhase = 0.5 * (1.0 - cos(time * zoomSpeed * TAU));
        effZoom = pow(10.0, effDepth * zoomPhase);
    } else {
        effZoom = pow(10.0, effDepth);
    }

    let rot = select(rotation, 0.0, poi > 0);

    // Resolve POI coordinates
    let poiCoords = getPOI(poi, centerHiX, centerLoX, centerHiY, centerLoY);
    let cX_df = poiCoords.cX;
    let cY_df = poiCoords.cY;

    var value: f32;

    if (outputMode == 4) {
        value = outputNormalMap(pos.xy, resolution, cX_df, cY_df,
                               effZoom, rot, maxIter, lightAngle,
                               stripeFreq, trapShape);
    } else {
        let coords = transformCoords_df64(pos.xy, resolution, cX_df, cY_df, effZoom, rot);
        let r = mandelbrot_df64(coords.re, coords.im, maxIter, stripeFreq, trapShape);

        if (outputMode == 0) {
            value = outputSmoothIteration(r.smoothIter, r.rawIter, maxIter);
        } else if (outputMode == 1) {
            value = outputDistance(r.z_final, r.dz_final, r.rawIter, maxIter);
        } else if (outputMode == 2) {
            value = outputStripeAverage(r.smoothIter, r.rawIter, r.stripeAcc, maxIter);
        } else if (outputMode == 3) {
            value = outputOrbitTrap(r.trapMin, r.rawIter, maxIter);
        } else {
            value = outputSmoothIteration(r.smoothIter, r.rawIter, maxIter);
        }
    }

    if (invertVal > 0.5) {
        value = 1.0 - value;
    }

    return vec4<f32>(vec3<f32>(value), 1.0);
}
