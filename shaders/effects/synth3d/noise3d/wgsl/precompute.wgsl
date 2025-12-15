// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> time: f32;
@group(0) @binding(1) var<uniform> scale: f32;
@group(0) @binding(2) var<uniform> seed: f32;
@group(0) @binding(3) var<uniform> octaves: i32;
@group(0) @binding(4) var<uniform> ridges: i32;
@group(0) @binding(5) var<uniform> volumeSize: i32;
@group(0) @binding(6) var<uniform> colorMode: i32;

// MRT output structure
struct FragmentOutput {
    @location(0) fragColor: vec4<f32>,
    @location(1) geoOut: vec4<f32>,
}

// Volume dimensions - stored as 2D atlas
// Atlas layout: volumeSize x (volumeSize * volumeSize)

const TAU: f32 = 6.283185307179586;
const W_PERIOD: f32 = 4.0;  // Period length in w-axis lattice units for seamless time loop

// Improved hash using multiple rounds of mixing (4D version)
fn hash4(p: vec4<f32>) -> f32 {
    let ps = p + seed * 0.1;
    var q = vec4<u32>(vec4<i32>(ps * 1000.0) + 65536);
    q = q * 1664525u + 1013904223u;
    q.x = q.x + q.y * q.z;
    q.y = q.y + q.z * q.w;
    q.z = q.z + q.w * q.x;
    q.w = q.w + q.x * q.y;
    q = q ^ (q >> vec4<u32>(16u));
    q.x = q.x + q.y * q.z;
    q.y = q.y + q.z * q.w;
    q.z = q.z + q.w * q.x;
    q.w = q.w + q.x * q.y;
    return f32(q.x ^ q.y ^ q.z ^ q.w) / 4294967295.0;
}

// Gradient from hash - returns normalized 4D vector
fn grad4(p: vec4<f32>) -> vec4<f32> {
    let h1 = hash4(p);
    let h2 = hash4(p + 127.1);
    let h3 = hash4(p + 269.5);
    let h4 = hash4(p + 419.2);
    let g = vec4<f32>(
        h1 * 2.0 - 1.0,
        h2 * 2.0 - 1.0,
        h3 * 2.0 - 1.0,
        h4 * 2.0 - 1.0
    );
    return normalize(g);
}

// Quintic interpolation for smooth transitions
fn quintic(t: f32) -> f32 {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Wrap w index for periodicity at lattice level
fn wrapW(w: f32) -> f32 {
    return w % W_PERIOD;
}

// 4D gradient noise - Perlin-style with quintic interpolation
// w-axis is periodic with period W_PERIOD for seamless time looping
fn noise4D(p: vec4<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    
    let u = vec4<f32>(quintic(f.x), quintic(f.y), quintic(f.z), quintic(f.w));
    
    // Wrap w indices for periodicity
    let iw0 = wrapW(i.w);
    let iw1 = wrapW(i.w + 1.0);
    
    // 16 corners of 4D hypercube with wrapped w
    // w=0 corners
    let n0000 = dot(grad4(vec4<f32>(i.xyz, iw0) + vec4<f32>(0.0, 0.0, 0.0, 0.0)), f - vec4<f32>(0.0, 0.0, 0.0, 0.0));
    let n1000 = dot(grad4(vec4<f32>(i.xyz, iw0) + vec4<f32>(1.0, 0.0, 0.0, 0.0)), f - vec4<f32>(1.0, 0.0, 0.0, 0.0));
    let n0100 = dot(grad4(vec4<f32>(i.xyz, iw0) + vec4<f32>(0.0, 1.0, 0.0, 0.0)), f - vec4<f32>(0.0, 1.0, 0.0, 0.0));
    let n1100 = dot(grad4(vec4<f32>(i.xyz, iw0) + vec4<f32>(1.0, 1.0, 0.0, 0.0)), f - vec4<f32>(1.0, 1.0, 0.0, 0.0));
    let n0010 = dot(grad4(vec4<f32>(i.xyz, iw0) + vec4<f32>(0.0, 0.0, 1.0, 0.0)), f - vec4<f32>(0.0, 0.0, 1.0, 0.0));
    let n1010 = dot(grad4(vec4<f32>(i.xyz, iw0) + vec4<f32>(1.0, 0.0, 1.0, 0.0)), f - vec4<f32>(1.0, 0.0, 1.0, 0.0));
    let n0110 = dot(grad4(vec4<f32>(i.xyz, iw0) + vec4<f32>(0.0, 1.0, 1.0, 0.0)), f - vec4<f32>(0.0, 1.0, 1.0, 0.0));
    let n1110 = dot(grad4(vec4<f32>(i.xyz, iw0) + vec4<f32>(1.0, 1.0, 1.0, 0.0)), f - vec4<f32>(1.0, 1.0, 1.0, 0.0));
    // w=1 corners
    let n0001 = dot(grad4(vec4<f32>(i.xyz, iw1) + vec4<f32>(0.0, 0.0, 0.0, 0.0)), f - vec4<f32>(0.0, 0.0, 0.0, 1.0));
    let n1001 = dot(grad4(vec4<f32>(i.xyz, iw1) + vec4<f32>(1.0, 0.0, 0.0, 0.0)), f - vec4<f32>(1.0, 0.0, 0.0, 1.0));
    let n0101 = dot(grad4(vec4<f32>(i.xyz, iw1) + vec4<f32>(0.0, 1.0, 0.0, 0.0)), f - vec4<f32>(0.0, 1.0, 0.0, 1.0));
    let n1101 = dot(grad4(vec4<f32>(i.xyz, iw1) + vec4<f32>(1.0, 1.0, 0.0, 0.0)), f - vec4<f32>(1.0, 1.0, 0.0, 1.0));
    let n0011 = dot(grad4(vec4<f32>(i.xyz, iw1) + vec4<f32>(0.0, 0.0, 1.0, 0.0)), f - vec4<f32>(0.0, 0.0, 1.0, 1.0));
    let n1011 = dot(grad4(vec4<f32>(i.xyz, iw1) + vec4<f32>(1.0, 0.0, 1.0, 0.0)), f - vec4<f32>(1.0, 0.0, 1.0, 1.0));
    let n0111 = dot(grad4(vec4<f32>(i.xyz, iw1) + vec4<f32>(0.0, 1.0, 1.0, 0.0)), f - vec4<f32>(0.0, 1.0, 1.0, 1.0));
    let n1111 = dot(grad4(vec4<f32>(i.xyz, iw1) + vec4<f32>(1.0, 1.0, 1.0, 0.0)), f - vec4<f32>(1.0, 1.0, 1.0, 1.0));
    
    // Quadrilinear interpolation
    // First along x
    let nx000 = mix(n0000, n1000, u.x);
    let nx100 = mix(n0100, n1100, u.x);
    let nx010 = mix(n0010, n1010, u.x);
    let nx110 = mix(n0110, n1110, u.x);
    let nx001 = mix(n0001, n1001, u.x);
    let nx101 = mix(n0101, n1101, u.x);
    let nx011 = mix(n0011, n1011, u.x);
    let nx111 = mix(n0111, n1111, u.x);
    
    // Then along y
    let nxy00 = mix(nx000, nx100, u.y);
    let nxy10 = mix(nx010, nx110, u.y);
    let nxy01 = mix(nx001, nx101, u.y);
    let nxy11 = mix(nx011, nx111, u.y);
    
    // Then along z
    let nxyz0 = mix(nxy00, nxy10, u.z);
    let nxyz1 = mix(nxy01, nxy11, u.z);
    
    // Finally along w
    return mix(nxyz0, nxyz1, u.w);
}

// FBM using 4D noise with periodic w for time
fn fbm4D(p: vec4<f32>, ridgesMode: i32) -> f32 {
    let MAX_OCT: i32 = 8;
    var amplitude: f32 = 0.5;
    var frequency: f32 = 1.0;
    var sum: f32 = 0.0;
    var maxVal: f32 = 0.0;
    var oct = octaves;
    if (oct < 1) { oct = 1; }
    
    for (var i: i32 = 0; i < MAX_OCT; i = i + 1) {
        if (i >= oct) { break; }
        let pos = vec4<f32>(p.xyz * frequency, p.w);
        var n = noise4D(pos);
        n = clamp(n * 1.5, -1.0, 1.0);
        if (ridgesMode == 1) {
            n = 1.0 - abs(n);
        } else {
            n = (n + 1.0) * 0.5;
        }
        sum = sum + n * amplitude;
        maxVal = maxVal + amplitude;
        frequency = frequency * 2.0;
        amplitude = amplitude * 0.5;
    }
    return sum / maxVal;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> FragmentOutput {
    // Use uniform for volume size
    let volSize = volumeSize;
    let volSizeF = f32(volSize);
    
    // Atlas is volSize x (volSize * volSize)
    // Pixel (x, y) maps to 3D coordinate (x, y % volSize, y / volSize)
    
    let pixelCoord = vec2<i32>(position.xy);
    
    let x = pixelCoord.x;
    let y = pixelCoord.y % volSize;
    let z = pixelCoord.y / volSize;
    
    // Bounds check
    if (x >= volSize || y >= volSize || z >= volSize) {
        return FragmentOutput(vec4<f32>(0.0), vec4<f32>(0.5, 0.5, 0.5, 0.0));
    }
    
    // Convert to normalized 3D coordinates in [-1, 1] world space (bounding box)
    let p = vec3<f32>(f32(x), f32(y), f32(z)) / (volSizeF - 1.0) * 2.0 - 1.0;
    
    // Scale for noise density
    let scaledP = p * scale;
    
    // Linear time traversal with periodic w-axis
    // time goes 0->1, map to 0->W_PERIOD for one complete loop
    let w = time * W_PERIOD;
    
    // Compute 4D FBM noise at this point with time as w
    let p4d = vec4<f32>(scaledP, w);
    let noiseVal = fbm4D(p4d, ridges);
    
    // Compute analytical gradient using finite differences in noise space
    let eps = 0.01 / scale;
    let nx = fbm4D(vec4<f32>(scaledP + vec3<f32>(eps, 0.0, 0.0), w), ridges);
    let ny = fbm4D(vec4<f32>(scaledP + vec3<f32>(0.0, eps, 0.0), w), ridges);
    let nz = fbm4D(vec4<f32>(scaledP + vec3<f32>(0.0, 0.0, eps), w), ridges);
    
    // Gradient points from low to high density
    let gradient = vec3<f32>(nx - noiseVal, ny - noiseVal, nz - noiseVal) / eps;
    
    // Normal points outward (from high to low density), encode in [0,1] range
    let normal = normalize(-gradient + vec3<f32>(1e-6));
    
    // Output volume data based on colorMode
    var fragColor: vec4<f32>;
    if (colorMode == 0) {
        fragColor = vec4<f32>(noiseVal, noiseVal, noiseVal, 1.0);
    } else {
        // For RGB color mode, compute 3 different noise channels with offsets
        let g = fbm4D(vec4<f32>(scaledP, w) + vec4<f32>(0.0, 0.0, 0.0, 1.33), ridges);
        let b = fbm4D(vec4<f32>(scaledP, w) + vec4<f32>(0.0, 0.0, 0.0, 2.67), ridges);
        fragColor = vec4<f32>(noiseVal, g, b, 1.0);
    }
    
    // Output analytical geometry: normal.xyz encoded [0,1], density in w
    let geoOut = vec4<f32>(normal * 0.5 + 0.5, noiseVal);
    
    return FragmentOutput(fragColor, geoOut);
}