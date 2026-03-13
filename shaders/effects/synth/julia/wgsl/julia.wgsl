/*
 * Julia set explorer — state-of-the-art (WGSL backend)
 *
 * Grayscale value output [0,1]. Alpha = 1.0 (synth effect).
 * Iteration: z = z² + c, z₀ = pixel, c = Julia constant.
 * Derivative: dz/dz₀ for distance estimation (no +1 term — c is constant).
 *
 * All coordinate and iteration math uses df64 (double-float emulation).
 * Single iteration loop computes all output values simultaneously.
 * Output mode selects which value to emit.
 */

struct Uniforms {
    // Slot 0: resolution.xy, time, (unused)
    // Slot 1: cReal, cImag, poi, outputMode
    // Slot 2: centerX, centerY, rotation, (unused)
    // Slot 3: iterations, stripeFreq, trapShape, lightAngle
    // Slot 4: cPath, cSpeed, cRadius, invert
    // Slot 5: zoomSpeed, zoomDepth, (unused), (unused)
    data: array<vec4<f32>, 6>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const BAILOUT: f32 = 256.0;
const LOG2: f32 = 0.6931471805599453;

// ============================================================================
// POI c-values (famous Julia sets)
// ============================================================================

fn getPOI(idx: i32) -> vec2<f32> {
    if (idx == 1) { return vec2<f32>(-0.123, 0.745); }         // Douady's rabbit
    if (idx == 2) { return vec2<f32>(-0.3905, 0.5868); }       // Siegel disk
    if (idx == 3) { return vec2<f32>(0.0, 1.0); }              // Dendrite
    if (idx == 4) { return vec2<f32>(-1.0, 0.0); }             // Basilica
    if (idx == 5) { return vec2<f32>(-0.7455, 0.1130); }       // Spiral galaxy
    if (idx == 6) { return vec2<f32>(-0.0986, 0.6534); }       // Lightning
    if (idx == 7) { return vec2<f32>(-0.8, 0.156); }           // Dragon curve
    if (idx == 8) { return vec2<f32>(-0.75, 0.0); }            // San Marco
    if (idx == 9) { return vec2<f32>(-0.5792, 0.5385); }       // Starfish
    if (idx == 10) { return vec2<f32>(0.28, 0.008); }          // Double spiral
    return vec2<f32>(-0.123, 0.745);
}

// ============================================================================
// Animated c-paths
// ============================================================================

fn getAnimatedC(pathType: i32, t: f32, radius: f32) -> vec2<f32> {
    let theta = t * TAU;
    if (pathType == 1) {
        return vec2<f32>(
            cos(theta) * 0.5 - cos(2.0 * theta) * 0.25,
            sin(theta) * 0.5 - sin(2.0 * theta) * 0.25
        );
    }
    if (pathType == 2) {
        return vec2<f32>(cos(theta), sin(theta)) * radius;
    }
    if (pathType == 3) {
        return vec2<f32>(-1.0 + cos(theta) * 0.25, sin(theta) * 0.25);
    }
    return vec2<f32>(0.0, 0.0);
}

// ============================================================================
// Complex multiply
// ============================================================================

fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// ============================================================================
// Double-float emulation (df64) — two f32s = ~15 decimal digits
// ============================================================================

fn df64_from(a: f32) -> vec2<f32> {
    return vec2<f32>(a, 0.0);
}

fn df64_add(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    let s = a.x + b.x;
    let v = s - a.x;
    let e = (a.x - (s - v)) + (b.x - v);
    return vec2<f32>(s, e + a.y + b.y);
}

fn df64_sub(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return df64_add(a, vec2<f32>(-b.x, -b.y));
}

fn df64_split(a: f32) -> vec2<f32> {
    let t = 4097.0 * a; // 2^12 + 1
    let hi = t - (t - a);
    return vec2<f32>(hi, a - hi);
}

fn df64_mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    let p = a.x * b.x;
    let as_ = df64_split(a.x);
    let bs = df64_split(b.x);
    var e = ((as_.x * bs.x - p) + as_.x * bs.y + as_.y * bs.x) + as_.y * bs.y;
    e = e + a.x * b.y + a.y * b.x;
    return vec2<f32>(p, e);
}

fn df64_mul_f(a: vec2<f32>, b: f32) -> vec2<f32> {
    let p = a.x * b;
    let as_ = df64_split(a.x);
    let bs = df64_split(b);
    var e = ((as_.x * bs.x - p) + as_.x * bs.y + as_.y * bs.x) + as_.y * bs.y;
    e = e + a.y * b;
    return vec2<f32>(p, e);
}

// ============================================================================
// Resolve c-value from POI/path/manual
// ============================================================================

fn resolveC(poi: i32, cPath: i32, time: f32, cSpeed: f32, cRadius: f32, cReal: f32, cImag: f32) -> vec2<f32> {
    if (poi > 0) { return getPOI(poi); }
    if (cPath > 0) { return getAnimatedC(cPath, time * cSpeed, cRadius); }
    return vec2<f32>(cReal, cImag);
}

// ============================================================================
// df64 coordinate transform
// ============================================================================

fn transformCoords(fragCoord: vec2<f32>, resolution: vec2<f32>,
                   cx: f32, cy: f32, zm: f32, rot: f32)
                   -> array<vec2<f32>, 2> {
    var uv = (fragCoord - 0.5 * resolution) / min(resolution.x, resolution.y);
    let angle = -rot * TAU / 360.0;
    let cs = cos(angle);
    let sn = sin(angle);
    uv = vec2<f32>(cs * uv.x - sn * uv.y, sn * uv.x + cs * uv.y);

    let scale = 2.5 / zm;
    let reDF = df64_add(df64_mul_f(df64_from(uv.x), scale), df64_from(cx));
    let imDF = df64_add(df64_mul_f(df64_from(uv.y), scale), df64_from(cy));
    return array<vec2<f32>, 2>(reDF, imDF);
}

// ============================================================================
// Unified Julia iteration — df64 z-iteration, all output values in one loop
// ============================================================================

struct JuliaResult {
    iter: f32,
    zMag2: f32,
    dzMag2: f32,
    stripeSum: f32,
    stripeCount: f32,
    stripeLast: f32,
    trapMin: f32,
};

fn juliaIterate(z0Re: vec2<f32>, z0Im: vec2<f32>, c: vec2<f32>,
                maxIter: i32, freq: f32, trap: i32) -> JuliaResult {
    var zRe = z0Re;
    var zIm = z0Im;
    var dz = vec2<f32>(1.0, 0.0);
    var i: f32 = 0.0;
    var stripeSum: f32 = 0.0;
    var stripeLast: f32 = 0.0;
    var stripeCount: f32 = 0.0;
    var trapMin: f32 = 1e10;
    let bail2 = BAILOUT * BAILOUT;

    var zSlow = vec2<f32>(z0Re.x, z0Im.x);
    var period: i32 = 0;

    for (var n: i32 = 0; n < 1000; n = n + 1) {
        if (n >= maxIter) { break; }

        // Derivative: dz = 2*z*dz (float32 using hi parts)
        let zF = vec2<f32>(zRe.x, zIm.x);
        dz = 2.0 * cmul(zF, dz);

        // Iteration: z = z² + c in df64
        let zRe2 = df64_mul(zRe, zRe);
        let zIm2 = df64_mul(zIm, zIm);
        let zReIm = df64_mul(zRe, zIm);

        zRe = df64_add(df64_sub(zRe2, zIm2), df64_from(c.x));
        zIm = df64_add(df64_mul_f(zReIm, 2.0), df64_from(c.y));

        // Bailout check (float32 hi parts)
        let zMag2 = zRe.x * zRe.x + zIm.x * zIm.x;
        if (zMag2 > bail2) { break; }

        i = i + 1.0;

        // Stripe average accumulation (float32 from hi parts)
        let zHi = vec2<f32>(zRe.x, zIm.x);
        stripeLast = 0.5 * sin(freq * atan2(zHi.y, zHi.x)) + 0.5;
        stripeSum = stripeSum + stripeLast;
        stripeCount = stripeCount + 1.0;

        // Orbit trap accumulation
        var td: f32;
        if (trap == 0) {
            td = length(zHi);
        } else if (trap == 1) {
            td = min(abs(zHi.x), abs(zHi.y));
        } else {
            td = abs(length(zHi) - 1.0);
        }
        trapMin = min(trapMin, td);

        // Period detection
        period = period + 1;
        if (period == 20) {
            period = 0;
            zSlow = zHi;
        } else if (distance(zHi, zSlow) < 1e-10) {
            i = f32(maxIter);
            break;
        }
    }

    var r: JuliaResult;
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

fn outputSmoothIteration(r: JuliaResult, maxIter: f32) -> f32 {
    if (r.iter >= maxIter) { return 0.0; }
    let log_zn = log(r.zMag2) * 0.5;
    let nu = log(log_zn / LOG2) / LOG2;
    return clamp((r.iter + 1.0 - nu) / maxIter, 0.0, 1.0);
}

fn outputDistanceEstimation(r: JuliaResult, maxIter: f32) -> f32 {
    if (r.iter >= maxIter) { return 0.0; }
    let zMag = sqrt(r.zMag2);
    let dzMag = sqrt(r.dzMag2);
    if (dzMag < 1e-10) { return 0.0; }
    let dist = 2.0 * zMag * log(zMag) / dzMag;
    return clamp(log(dist + 1.0) * 2.0, 0.0, 1.0);
}

fn outputStripeAverage(r: JuliaResult, maxIter: f32) -> f32 {
    if (r.iter >= maxIter) { return 0.0; }
    if (r.stripeCount < 1.0) { return 0.0; }
    let avg = r.stripeSum / r.stripeCount;
    var prevAvg = avg;
    if (r.stripeCount > 1.0) { prevAvg = (r.stripeSum - r.stripeLast) / (r.stripeCount - 1.0); }
    let log_zn = log(r.zMag2) * 0.5;
    let nu = log(log_zn / LOG2) / LOG2;
    let frac = clamp(1.0 - nu + floor(nu), 0.0, 1.0);
    return clamp(mix(prevAvg, avg, frac), 0.0, 1.0);
}

fn outputOrbitTrap(r: JuliaResult, maxIter: f32) -> f32 {
    if (r.iter >= maxIter) { return 0.0; }
    return clamp(1.0 - r.trapMin, 0.0, 1.0);
}

// ============================================================================
// Normal map — runs iteration 3 times for finite differences
// ============================================================================

fn iterateSmooth(fragCoord: vec2<f32>, c: vec2<f32>, maxIter: i32,
                 resolution: vec2<f32>, cx: f32, cy: f32, zm: f32, rot: f32) -> f32 {
    let coords = transformCoords(fragCoord, resolution, cx, cy, zm, rot);
    var zRe = coords[0];
    var zIm = coords[1];
    var i: f32 = 0.0;
    let bail2 = BAILOUT * BAILOUT;

    for (var n: i32 = 0; n < 1000; n = n + 1) {
        if (n >= maxIter) { break; }

        let zRe2 = df64_mul(zRe, zRe);
        let zIm2 = df64_mul(zIm, zIm);
        let zReIm = df64_mul(zRe, zIm);

        zRe = df64_add(df64_sub(zRe2, zIm2), df64_from(c.x));
        zIm = df64_add(df64_mul_f(zReIm, 2.0), df64_from(c.y));

        let zMag2 = zRe.x * zRe.x + zIm.x * zIm.x;
        if (zMag2 > bail2) { break; }
        i = i + 1.0;
    }

    if (i >= f32(maxIter)) { return 0.0; }
    let zMag2 = zRe.x * zRe.x + zIm.x * zIm.x;
    let log_zn = log(zMag2) * 0.5;
    let nu = log(log_zn / LOG2) / LOG2;
    return clamp((i + 1.0 - nu) / f32(maxIter), 0.0, 1.0);
}

fn outputNormalMap(fragCoord: vec2<f32>, c: vec2<f32>, maxIter: i32, angle: f32,
                   resolution: vec2<f32>, cx: f32, cy: f32, zm: f32, rot: f32) -> f32 {
    let d0 = iterateSmooth(fragCoord, c, maxIter, resolution, cx, cy, zm, rot);
    let d1 = iterateSmooth(fragCoord + vec2<f32>(1.0, 0.0), c, maxIter, resolution, cx, cy, zm, rot);
    let d2 = iterateSmooth(fragCoord + vec2<f32>(0.0, 1.0), c, maxIter, resolution, cx, cy, zm, rot);

    let normal = normalize(vec3<f32>(d1 - d0, d2 - d0, 0.05));
    let rad = angle * TAU / 360.0;
    let lightDir = normalize(vec3<f32>(cos(rad), sin(rad), 0.7));
    return clamp(max(dot(normal, lightDir), 0.0), 0.0, 1.0);
}

// ============================================================================
// Main
// ============================================================================

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // Unpack uniforms
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;

    let cReal = uniforms.data[1].x;
    let cImag = uniforms.data[1].y;
    let poi = i32(uniforms.data[1].z);
    let outputMode = i32(uniforms.data[1].w);

    let centerX = uniforms.data[2].x;
    let centerY = uniforms.data[2].y;
    let rotation = uniforms.data[2].z;

    let iterations = i32(uniforms.data[3].x);
    let stripeFreq = uniforms.data[3].y;
    let trapShape = i32(uniforms.data[3].z);
    let lightAngle = uniforms.data[3].w;

    let cPath = i32(uniforms.data[4].x);
    let cSpeed = uniforms.data[4].y;
    let cRadius = uniforms.data[4].z;
    let invertFlag = uniforms.data[4].w;

    let zoomSpeed = uniforms.data[5].x;
    let zoomDepth = uniforms.data[5].y;

    // Resolve c-value
    let c = resolveC(poi, cPath, time, cSpeed, cRadius, cReal, cImag);

    // Zoom: sinusoidal when animated, static pow(10, depth) when not
    var effectiveZoom: f32;
    if (zoomSpeed > 0.0) {
        let phase = 0.5 * (1.0 - cos(time * zoomSpeed * TAU));
        effectiveZoom = pow(10.0, zoomDepth * phase);
    } else {
        effectiveZoom = pow(10.0, zoomDepth);
    }

    // Compute output
    var value: f32;

    if (outputMode == 4) {
        value = outputNormalMap(pos.xy, c, iterations, lightAngle, resolution, centerX, centerY, effectiveZoom, rotation);
    } else {
        let coords = transformCoords(pos.xy, resolution, centerX, centerY, effectiveZoom, rotation);
        let r = juliaIterate(coords[0], coords[1], c, iterations, stripeFreq, trapShape);

        if (outputMode == 0) {
            value = outputSmoothIteration(r, f32(iterations));
        } else if (outputMode == 1) {
            value = outputDistanceEstimation(r, f32(iterations));
        } else if (outputMode == 2) {
            value = outputStripeAverage(r, f32(iterations));
        } else if (outputMode == 3) {
            value = outputOrbitTrap(r, f32(iterations));
        } else {
            value = outputSmoothIteration(r, f32(iterations));
        }
    }

    // Invert
    if (invertFlag > 0.5) {
        value = 1.0 - value;
    }

    return vec4<f32>(vec3<f32>(value), 1.0);
}
