// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> aspect: f32;
@group(0) @binding(2) var<uniform> time: f32;
@group(0) @binding(3) var<uniform> scale: f32;
@group(0) @binding(4) var<uniform> seed: f32;
@group(0) @binding(5) var<uniform> octaves: i32;
@group(0) @binding(6) var<uniform> colorMode: i32;
@group(0) @binding(7) var<uniform> ridges: i32;

/* 3D gradient noise with quintic interpolation
   Animated using periodic z-axis for seamless looping
   2D output is a cross-section through 3D noise volume */

const TAU: f32 = 6.283185307179586;
const Z_PERIOD: f32 = 4.0;  // Period length in z-axis lattice units

// 3D hash using multiple rounds of mixing
// Based on techniques from "Hash Functions for GPU Rendering" (Jarzynski & Olano, 2020)
fn hash3(p: vec3<f32>) -> f32 {
    // Add seed to input to vary the noise pattern
    let ps = p + seed * 0.1;
    
    // Convert to unsigned integer values via large multipliers
    var q = vec3<u32>(vec3<i32>(ps * 1000.0) + 65536);
    
    // Multiple rounds of mixing for thorough decorrelation
    q = q * 1664525u + 1013904223u;  // LCG constants
    q.x = q.x + q.y * q.z;
    q.y = q.y + q.z * q.x;
    q.z = q.z + q.x * q.y;
    
    q = q ^ (q >> vec3<u32>(16u));
    
    q.x = q.x + q.y * q.z;
    q.y = q.y + q.z * q.x;
    q.z = q.z + q.x * q.y;
    
    return f32(q.x ^ q.y ^ q.z) / 4294967295.0;
}

// Gradient from hash - returns normalized 3D vector
fn grad3(p: vec3<f32>) -> vec3<f32> {
    let h1 = hash3(p);
    let h2 = hash3(p + 127.1);
    let h3 = hash3(p + 269.5);
    
    // Generate independent gradient components - each component is [-1, 1]
    let g = vec3<f32>(
        h1 * 2.0 - 1.0,
        h2 * 2.0 - 1.0,
        h3 * 2.0 - 1.0
    );
    
    return normalize(g);
}

// Quintic interpolation for smooth transitions
fn quintic(t: f32) -> f32 {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Wrap z index for periodicity at lattice level
fn wrapZ(z: f32) -> f32 {
    return z % Z_PERIOD;
}

// 3D gradient noise - Perlin-style with quintic interpolation
// z-axis is periodic with period Z_PERIOD
fn noise3D(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    
    let u = vec3<f32>(quintic(f.x), quintic(f.y), quintic(f.z));
    
    // Wrap z indices for periodicity - gradients at z=0 and z=Z_PERIOD will match
    let iz0 = wrapZ(i.z);
    let iz1 = wrapZ(i.z + 1.0);
    
    // 8 corners of 3D cube with wrapped z
    let n000 = dot(grad3(vec3<f32>(i.xy, iz0) + vec3<f32>(0.0, 0.0, 0.0)), f - vec3<f32>(0.0, 0.0, 0.0));
    let n100 = dot(grad3(vec3<f32>(i.xy, iz0) + vec3<f32>(1.0, 0.0, 0.0)), f - vec3<f32>(1.0, 0.0, 0.0));
    let n010 = dot(grad3(vec3<f32>(i.xy, iz0) + vec3<f32>(0.0, 1.0, 0.0)), f - vec3<f32>(0.0, 1.0, 0.0));
    let n110 = dot(grad3(vec3<f32>(i.xy, iz0) + vec3<f32>(1.0, 1.0, 0.0)), f - vec3<f32>(1.0, 1.0, 0.0));
    let n001 = dot(grad3(vec3<f32>(i.xy, iz1) + vec3<f32>(0.0, 0.0, 0.0)), f - vec3<f32>(0.0, 0.0, 1.0));
    let n101 = dot(grad3(vec3<f32>(i.xy, iz1) + vec3<f32>(1.0, 0.0, 0.0)), f - vec3<f32>(1.0, 0.0, 1.0));
    let n011 = dot(grad3(vec3<f32>(i.xy, iz1) + vec3<f32>(0.0, 1.0, 0.0)), f - vec3<f32>(0.0, 1.0, 1.0));
    let n111 = dot(grad3(vec3<f32>(i.xy, iz1) + vec3<f32>(1.0, 1.0, 0.0)), f - vec3<f32>(1.0, 1.0, 1.0));
    
    let nx00 = mix(n000, n100, u.x);
    let nx10 = mix(n010, n110, u.x);
    let nx01 = mix(n001, n101, u.x);
    let nx11 = mix(n011, n111, u.x);
    
    let nxy0 = mix(nx00, nx10, u.y);
    let nxy1 = mix(nx01, nx11, u.y);
    
    return mix(nxy0, nxy1, u.z);
}

// FBM using 3D noise with circular time for seamless looping
// 2D cross-section moves through 3D noise as time varies
fn fbm(st: vec2<f32>, timeAngle: f32, channelOffset: f32, ridgedMode: i32) -> f32 {
    let MAX_OCT: i32 = 8;
    var amplitude: f32 = 0.5;
    var frequency: f32 = 1.0;
    var sum: f32 = 0.0;
    var maxVal: f32 = 0.0;
    var oct = octaves;
    if (oct < 1) { oct = 1; }
    
    // Linear time traversal with periodic z-axis
    // time goes 0->1, map to 0->Z_PERIOD for one complete loop
    let z = timeAngle / TAU * Z_PERIOD + channelOffset;
    
    for (var i: i32 = 0; i < MAX_OCT; i = i + 1) {
        if (i >= oct) { break; }
        let p = vec3<f32>(st * frequency, z);
        var n = noise3D(p);  // -1..1
        // Scale up by ~1.5 to spread the gaussian-ish distribution
        // Perlin noise rarely hits +-1, so this expands the usable range
        n = clamp(n * 1.5, -1.0, 1.0);
        if (ridgedMode == 1) {
            n = 1.0 - abs(n);  // fold at zero, gives 0..1 with ridges at zero-crossings
        } else {
            n = (n + 1.0) * 0.5;  // normalize to 0..1
        }
        sum = sum + n * amplitude;
        maxVal = maxVal + amplitude;
        frequency = frequency * 2.0;
        amplitude = amplitude * 0.5;
    }
    return sum / maxVal;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    var res = resolution;
    if (res.x < 1.0) { res = vec2<f32>(1024.0, 1024.0); }
    var st = position.xy / res;
    st.y = 1.0 - st.y;  // Flip Y to match WebGL coordinate system
    // Center UVs so zoom scales from center, not corner
    st = st - 0.5;
    st.x = st.x * aspect;
    // Invert scale to match vnoise convention: higher scale = fewer cells (zoomed in)
    let freq = max(0.1, 100.0 / max(scale, 0.01));
    st = st * freq;
    // Offset to keep noise coords positive (avoids hash artifacts at boundaries)
    st = st + 1000.0;
    
    // time is 0-1 representing position around circle for seamless looping
    let timeAngle = time * TAU;
    
    let r = fbm(st, timeAngle, 0.0, ridges);
    let g = fbm(st, timeAngle, 1.33, ridges);
    let b = fbm(st, timeAngle, 2.67, ridges);
    
    var col: vec3<f32>;
    if (colorMode == 0) {
        // Mono mode
        col = vec3<f32>(r);
    } else {
        // RGB mode
        col = vec3<f32>(r, g, b);
    }
    
    return vec4<f32>(col, 1.0);
}
