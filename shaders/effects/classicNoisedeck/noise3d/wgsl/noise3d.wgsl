/*
 * WGSL 3D noise shader.
 * Slices through 3D simplex noise volumes for volumetric motion cues.
 * Loop and rotation controls are normalized to keep the marching direction stable during long animations.
 * 
 * Full parity with GLSL implementation including:
 * - Ray marching
 * - Multiple noise types (simplex, cellular, voronoi, sine, spheres, cubes, wavy planes)
 * - Surface normals
 * - Multiple color modes (grayscale, HSV, surface normal, depth)
 * - Lighting and fog
 */

// NOISE_TYPE is a compile-time const injected by the runtime via injectDefines.
// See classicNoisedeck/noise3d/definition.js `globals.type.define`. Binding 4
// (formerly NOISE_TYPE) is freed; the other binding indices are unchanged.

// Uniforms - individual bindings pattern for generator effects
@group(0) @binding(0) var<uniform> time: f32;
@group(0) @binding(1) var<uniform> seed: i32;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> noiseScale: f32;
@group(0) @binding(5) var<uniform> ridges: i32;
@group(0) @binding(6) var<uniform> offsetX: f32;
@group(0) @binding(7) var<uniform> offsetY: f32;
@group(0) @binding(8) var<uniform> speed: i32;
@group(0) @binding(9) var<uniform> colorMode: i32;
@group(0) @binding(10) var<uniform> hueRotation: f32;
@group(0) @binding(11) var<uniform> hueRange: f32;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// ===== PCG PRNG =====
// https://github.com/riccardoscalco/glsl-pcg-prng - MIT License
fn pcg(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn prng(p: vec3<f32>) -> vec3<f32> {
    var q = p;
    q.x = select(q.x * 2.0, -q.x * 2.0 + 1.0, q.x < 0.0);
    q.y = select(q.y * 2.0, -q.y * 2.0 + 1.0, q.y < 0.0);
    q.z = select(q.z * 2.0, -q.z * 2.0 + 1.0, q.z < 0.0);
    return vec3<f32>(pcg(vec3<u32>(q))) / f32(0xffffffffu);
}

fn random(st: vec2<f32>) -> f32 {
    return prng(vec3<f32>(st, 0.0)).x;
}

// ===== Utility functions =====
fn map_value(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn smootherstep(x: f32) -> f32 {
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

fn smoothabs(v: f32, m: f32) -> f32 {
    return sqrt(v * v + m);
}

// ===== 3D Voronoi =====
// https://github.com/MaxBittker/glsl-voronoi-noise - MIT License
const myt: mat2x2<f32> = mat2x2<f32>(0.12121212, 0.13131313, -0.13131313, 0.12121212);
const mys: vec2<f32> = vec2<f32>(1e4, 1e6);

fn rhash(uv_in: vec2<f32>) -> vec2<f32> {
    var uv = myt * uv_in;
    uv = uv * mys;
    return fract(fract(uv / mys) * uv);
}

fn voronoi3d(x: vec3<f32>) -> vec3<f32> {
    let p = floor(x);
    let f = fract(x);

    var id = 0.0;
    var res = vec2<f32>(100.0);
    
    for (var k: i32 = -1; k <= 1; k = k + 1) {
        for (var j: i32 = -1; j <= 1; j = j + 1) {
            for (var i: i32 = -1; i <= 1; i = i + 1) {
                let b = vec3<f32>(f32(i), f32(j), f32(k));
                let r = b - f + prng(p + b);
                let d = dot(r, r);

                let cond = max(sign(res.x - d), 0.0);
                let nCond = 1.0 - cond;

                let cond2 = nCond * max(sign(res.y - d), 0.0);
                let nCond2 = 1.0 - cond2;

                id = (dot(p + b, vec3<f32>(1.0, 57.0, 113.0)) * cond) + (id * nCond);
                res = vec2<f32>(d, res.x) * cond + res * nCond;

                res.y = cond2 * d + nCond2 * res.y;
            }
        }
    }

    return vec3<f32>(sqrt(res), abs(id));
}

// ===== 3D Cellular Noise =====
// Stefan Gustavson - MIT License
fn mod289_3(x: vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod7(x: vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 7.0)) * 7.0;
}

fn permute_3(x: vec3<f32>) -> vec3<f32> {
    return mod289_3((34.0 * x + 10.0) * x);
}

fn cellular(P: vec3<f32>) -> vec2<f32> {
    let K: f32 = 0.142857142857;
    let Ko: f32 = 0.428571428571;
    let K2: f32 = 0.020408163265306;
    let Kz: f32 = 0.166666666667;
    let Kzo: f32 = 0.416666666667;
    let jitter: f32 = 1.0;

    let Pi = mod289_3(floor(P));
    let Pf = fract(P) - 0.5;

    let Pfx = Pf.x + vec3<f32>(1.0, 0.0, -1.0);
    let Pfy = Pf.y + vec3<f32>(1.0, 0.0, -1.0);
    let Pfz = Pf.z + vec3<f32>(1.0, 0.0, -1.0);

    let p = permute_3(Pi.x + vec3<f32>(-1.0, 0.0, 1.0));
    let p1 = permute_3(p + Pi.y - 1.0);
    let p2 = permute_3(p + Pi.y);
    let p3 = permute_3(p + Pi.y + 1.0);

    let p11 = permute_3(p1 + Pi.z - 1.0);
    let p12 = permute_3(p1 + Pi.z);
    let p13 = permute_3(p1 + Pi.z + 1.0);

    let p21 = permute_3(p2 + Pi.z - 1.0);
    let p22 = permute_3(p2 + Pi.z);
    let p23 = permute_3(p2 + Pi.z + 1.0);

    let p31 = permute_3(p3 + Pi.z - 1.0);
    let p32 = permute_3(p3 + Pi.z);
    let p33 = permute_3(p3 + Pi.z + 1.0);

    let ox11 = fract(p11 * K) - Ko;
    let oy11 = mod7(floor(p11 * K)) * K - Ko;
    let oz11 = floor(p11 * K2) * Kz - Kzo;

    let ox12 = fract(p12 * K) - Ko;
    let oy12 = mod7(floor(p12 * K)) * K - Ko;
    let oz12 = floor(p12 * K2) * Kz - Kzo;

    let ox13 = fract(p13 * K) - Ko;
    let oy13 = mod7(floor(p13 * K)) * K - Ko;
    let oz13 = floor(p13 * K2) * Kz - Kzo;

    let ox21 = fract(p21 * K) - Ko;
    let oy21 = mod7(floor(p21 * K)) * K - Ko;
    let oz21 = floor(p21 * K2) * Kz - Kzo;

    let ox22 = fract(p22 * K) - Ko;
    let oy22 = mod7(floor(p22 * K)) * K - Ko;
    let oz22 = floor(p22 * K2) * Kz - Kzo;

    let ox23 = fract(p23 * K) - Ko;
    let oy23 = mod7(floor(p23 * K)) * K - Ko;
    let oz23 = floor(p23 * K2) * Kz - Kzo;

    let ox31 = fract(p31 * K) - Ko;
    let oy31 = mod7(floor(p31 * K)) * K - Ko;
    let oz31 = floor(p31 * K2) * Kz - Kzo;

    let ox32 = fract(p32 * K) - Ko;
    let oy32 = mod7(floor(p32 * K)) * K - Ko;
    let oz32 = floor(p32 * K2) * Kz - Kzo;

    let ox33 = fract(p33 * K) - Ko;
    let oy33 = mod7(floor(p33 * K)) * K - Ko;
    let oz33 = floor(p33 * K2) * Kz - Kzo;

    let dx11 = Pfx + jitter * ox11;
    let dy11 = Pfy.x + jitter * oy11;
    let dz11 = Pfz.x + jitter * oz11;

    let dx12 = Pfx + jitter * ox12;
    let dy12 = Pfy.x + jitter * oy12;
    let dz12 = Pfz.y + jitter * oz12;

    let dx13 = Pfx + jitter * ox13;
    let dy13 = Pfy.x + jitter * oy13;
    let dz13 = Pfz.z + jitter * oz13;

    let dx21 = Pfx + jitter * ox21;
    let dy21 = Pfy.y + jitter * oy21;
    let dz21 = Pfz.x + jitter * oz21;

    let dx22 = Pfx + jitter * ox22;
    let dy22 = Pfy.y + jitter * oy22;
    let dz22 = Pfz.y + jitter * oz22;

    let dx23 = Pfx + jitter * ox23;
    let dy23 = Pfy.y + jitter * oy23;
    let dz23 = Pfz.z + jitter * oz23;

    let dx31 = Pfx + jitter * ox31;
    let dy31 = Pfy.z + jitter * oy31;
    let dz31 = Pfz.x + jitter * oz31;

    let dx32 = Pfx + jitter * ox32;
    let dy32 = Pfy.z + jitter * oy32;
    let dz32 = Pfz.y + jitter * oz32;

    let dx33 = Pfx + jitter * ox33;
    let dy33 = Pfy.z + jitter * oy33;
    let dz33 = Pfz.z + jitter * oz33;

    var d11 = dx11 * dx11 + dy11 * dy11 + dz11 * dz11;
    var d12 = dx12 * dx12 + dy12 * dy12 + dz12 * dz12;
    var d13 = dx13 * dx13 + dy13 * dy13 + dz13 * dz13;
    var d21 = dx21 * dx21 + dy21 * dy21 + dz21 * dz21;
    var d22 = dx22 * dx22 + dy22 * dy22 + dz22 * dz22;
    var d23 = dx23 * dx23 + dy23 * dy23 + dz23 * dz23;
    var d31 = dx31 * dx31 + dy31 * dy31 + dz31 * dz31;
    var d32 = dx32 * dx32 + dy32 * dy32 + dz32 * dz32;
    var d33 = dx33 * dx33 + dy33 * dy33 + dz33 * dz33;

    // Full F1+F2 sort
    var d1a = min(d11, d12);
    d12 = max(d11, d12);
    d11 = min(d1a, d13);
    d13 = max(d1a, d13);
    d12 = min(d12, d13);
    
    var d2a = min(d21, d22);
    d22 = max(d21, d22);
    d21 = min(d2a, d23);
    d23 = max(d2a, d23);
    d22 = min(d22, d23);
    
    var d3a = min(d31, d32);
    d32 = max(d31, d32);
    d31 = min(d3a, d33);
    d33 = max(d3a, d33);
    d32 = min(d32, d33);
    
    var da = min(d11, d21);
    d21 = max(d11, d21);
    d11 = min(da, d31);
    d31 = max(da, d31);
    
    d11 = vec3<f32>(
        select(d11.x, d11.y, d11.x > d11.y),
        select(d11.y, d11.x, d11.x > d11.y),
        d11.z
    );
    d11 = vec3<f32>(
        select(d11.x, d11.z, d11.x > d11.z),
        d11.y,
        select(d11.z, d11.x, d11.x > d11.z)
    );
    
    d12 = min(d12, d21);
    d12 = min(d12, d22);
    d12 = min(d12, d31);
    d12 = min(d12, d32);
    d11 = vec3<f32>(d11.x, min(d11.yz, d12.xy));
    d11.y = min(d11.y, d12.z);
    d11.y = min(d11.y, d11.z);
    
    return sqrt(d11.xy);
}

// ===== 3D Simplex Noise =====
// Ashima Arts - MIT License
fn mod289_4(x: vec4<f32>) -> vec4<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute_4(x: vec4<f32>) -> vec4<f32> {
    return mod289_4(((x * 34.0) + 10.0) * x);
}

fn taylorInvSqrt(r: vec4<f32>) -> vec4<f32> {
    return 1.79284291400159 - 0.85373472095314 * r;
}

fn snoise(v: vec3<f32>) -> f32 {
    let C = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
    let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);

    var i = floor(v + dot(v, C.yyy));
    var x0 = v - i + dot(i, C.xxx);

    var g = step(x0.yzx, x0.xyz);
    var l = 1.0 - g;
    var i1 = min(g.xyz, l.zxy);
    var i2 = max(g.xyz, l.zxy);

    var x1 = x0 - i1 + C.xxx;
    var x2 = x0 - i2 + C.yyy;
    var x3 = x0 - D.yyy;

    i = mod289_3(i);
    var p = permute_4(
        permute_4(
            permute_4(i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0)
        )
        + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0)
    );

    let n_ = 0.142857142857;
    let ns = n_ * D.wyz - D.xzx;

    var j = p - 49.0 * floor(p * ns.z * ns.z);

    var x_ = floor(j * ns.z);
    var y_ = floor(j - 7.0 * x_);

    var x = x_ * ns.x + ns.yyyy;
    var y = y_ * ns.x + ns.yyyy;
    var h = 1.0 - abs(x) - abs(y);

    var b0 = vec4<f32>(x.xy, y.xy);
    var bHigh = vec4<f32>(x.zw, y.zw);

    var s0 = floor(b0) * 2.0 + 1.0;
    var sHigh = floor(bHigh) * 2.0 + 1.0;
    var sh = -step(h, vec4<f32>(0.0));

    var a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    var aHigh = bHigh.xzyw + sHigh.xzyw * sh.zzww;

    var p0 = vec3<f32>(a0.xy, h.x);
    var p1 = vec3<f32>(a0.zw, h.y);
    var p2 = vec3<f32>(aHigh.xy, h.z);
    var p3 = vec3<f32>(aHigh.zw, h.w);

    var norm = taylorInvSqrt(vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 = p0 * norm.x;
    p1 = p1 * norm.y;
    p2 = p2 * norm.z;
    p3 = p3 * norm.w;

    var m = max(vec4<f32>(0.5) - vec4<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4<f32>(0.0));
    m = m * m;
    return 105.0 * dot(m * m, vec4<f32>(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// ===== Additional noise types =====
fn sine3D(p: vec3<f32>) -> f32 {
    let r0 = prng(vec3<f32>(f32(seed))) * TAU;
    let a = r0.x;
    let b = r0.y;
    let c = r0.z;

    let r1 = prng(vec3<f32>(f32(seed))) + 1.0;
    let r2 = prng(vec3<f32>(f32(seed) + 10.0)) + 1.0;
    let r3 = prng(vec3<f32>(f32(seed) + 20.0)) + 1.0;
    let xv = sin(r1.x * p.z + sin(r1.y * p.x + a) + sin(r1.z * p.y + b) + c);
    let yv = sin(r2.x * p.x + sin(r2.y * p.y + b) + sin(r2.z * p.z + c) + a);
    let zv = sin(r3.x * p.y + sin(r3.y * p.z + c) + sin(r3.z * p.x + a) + b);

    return (xv + yv + zv) * 0.33 + 0.33;
}

fn spheres(p: vec3<f32>) -> f32 {
    var q = p;
    let pr = p - round(p);
    let ip = floor(q);
    let fp = fract(pr);
    let r1 = prng(ip + f32(seed)) * 0.5 + 0.25;
    return length(fp - 0.5) - map_value(noiseScale, 1.0, 100.0, 0.025, 0.55) * r1.x;
}

fn cubes(p_in: vec3<f32>) -> f32 {
    var p = p_in;
    let s = 4.0;
    p.x = p.x - s * 0.5;
    p = p - s * round(p / s);
    let b = vec3<f32>(map_value(noiseScale, 1.0, 100.0, 0.1, 0.95));
    let q = abs(p) - b;
    return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// ===== Distance function (SDF) =====
fn getDist(p: vec3<f32>) -> f32 {
    var d: f32;
    
    if (NOISE_TYPE == 12) {
        // simplex
        let scale = map_value(noiseScale, 1.0, 100.0, 0.25, 0.025);
        d = snoise(p * scale + f32(seed)) * 0.5 + 0.5;
        d = smootherstep(d);
    } else if (NOISE_TYPE == 20) {
        // cell
        let scale = map_value(noiseScale, 1.0, 100.0, 0.1, 0.35);
        d = cellular(p * 0.1 + f32(seed)).x;
        d = smoothstep(scale, 0.5, d);
    } else if (NOISE_TYPE == 21) {
        // cell v2
        d = voronoi3d(p * 0.1 + f32(seed)).x;
        let scale = map_value(noiseScale, 1.0, 100.0, 0.1, 0.35);
        d = smoothstep(scale, 0.5, d);
    } else if (NOISE_TYPE == 30) {
        // sine
        let scale = map_value(noiseScale, 1.0, 100.0, 1.0, 0.1);
        d = sine3D(p * scale);
    } else if (NOISE_TYPE == 40) {
        d = spheres(p);
    } else if (NOISE_TYPE == 50) {
        d = cubes(p);
    } else if (NOISE_TYPE == 60) {
        // wavy planes both
        let scale = map_value(noiseScale, 1.0, 100.0, 0.25, 0.025);
        d = -abs(p.y) + 4.0 + snoise(p * scale + f32(seed)) * 0.75;
    } else if (NOISE_TYPE == 61) {
        // wavy plane lower
        let scale = map_value(noiseScale, 1.0, 100.0, 0.25, 0.025);
        d = p.y + 4.0 + snoise(p * scale + f32(seed)) * 0.75;
    } else if (NOISE_TYPE == 62) {
        // wavy plane upper
        let scale = map_value(noiseScale, 1.0, 100.0, 0.25, 0.025);
        d = -p.y + 2.0 + snoise(p * scale + f32(seed)) * 0.75;
    } else {
        // default to simplex
        let scale = map_value(noiseScale, 1.0, 100.0, 0.25, 0.025);
        d = snoise(p * scale + f32(seed)) * 0.5 + 0.5;
        d = smootherstep(d);
    }

    if (ridges != 0 && NOISE_TYPE == 12) {
        d = 1.0 - smoothabs(d * 2.0 - 1.0, 0.05);
    }

    return d;
}

// ===== Surface normal =====
fn getNormal(p: vec3<f32>) -> vec3<f32> {
    let epsilon = 0.01;

    let d = getDist(p);
    let dx = getDist(p + vec3<f32>(epsilon, 0.0, 0.0)) - d;
    let dy = getDist(p + vec3<f32>(0.0, epsilon, 0.0)) - d;
    let dz = getDist(p + vec3<f32>(0.0, 0.0, epsilon)) - d;

    return normalize(vec3<f32>(dx, dy, dz));
}

// ===== Ray marching =====
fn rayMarch(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> f32 {
    let maxSteps: i32 = 100;
    let maxDist: f32 = 100.0;
    let minDist: f32 = 0.01;
    var d: f32 = 0.0;

    for (var i: i32 = 0; i < maxSteps; i = i + 1) {
        let p = rayOrigin + rayDirection * d;
        let dist = getDist(p);
        d = d + dist;
        if (d > maxDist || dist < minDist) {
            break;
        }
    }
    return d;
}

// ===== Color conversion =====
fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    
    let c = v * s;
    let h6 = h * 6.0;
    let xv = c * (1.0 - abs((h6 - 2.0 * floor(h6 / 2.0)) - 1.0));
    let m = v - c;

    var rgb: vec3<f32>;

    if (h6 < 1.0) {
        rgb = vec3<f32>(c, xv, 0.0);
    } else if (h6 < 2.0) {
        rgb = vec3<f32>(xv, c, 0.0);
    } else if (h6 < 3.0) {
        rgb = vec3<f32>(0.0, c, xv);
    } else if (h6 < 4.0) {
        rgb = vec3<f32>(0.0, xv, c);
    } else if (h6 < 5.0) {
        rgb = vec3<f32>(xv, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, xv);
    }

    return rgb + vec3<f32>(m, m, m);
}

// ===== Main fragment shader =====
@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    let st = (pos.xy - 0.5 * resolution) / resolution.y;

    // Ray marching - calculate distance to scene objects
    let rayOrigin = vec3<f32>(offsetX * 0.1, offsetY * 0.1, -8.0 + time * TAU * f32(speed));
    let rayDirection = normalize(vec3<f32>(st, 1.0));
    let d = rayMarch(rayOrigin, rayDirection);

    // Calculate the lighting
    let p = rayOrigin + rayDirection * d;
    let lightPosition = rayOrigin + vec3<f32>(-5.0, 5.0, -10.0);
    let lightVector = normalize(lightPosition - p);
    let normal = getNormal(p);
    let diffuse = clamp(dot(normal, lightVector), 0.0, 1.0);

    // Colorize based on mode
    if (colorMode == 0) {
        // grayscale
        color = vec4<f32>(vec3<f32>(diffuse), 1.0);
    } else if (colorMode == 6) {
        // hsv
        color = vec4<f32>(hsv2rgb(vec3<f32>(diffuse * (hueRange * 0.01) + (hueRotation / 360.0), 0.75, 0.75)), 1.0);
    } else if (colorMode == 7) {
        // surface normal
        color = vec4<f32>(normal, 1.0);
    } else if (colorMode == 8) {
        // depth
        color = vec4<f32>(vec3<f32>(clamp(d, 0.0, 1.0)), 1.0);
    } else {
        // default to grayscale
        color = vec4<f32>(vec3<f32>(diffuse), 1.0);
    }

    // Apply fog
    let fogDist = clamp(d / 50.0, 0.0, 1.0);
    color = vec4<f32>(mix(color.rgb, vec3<f32>(0.0), fogDist), 1.0);

    return color;
}
