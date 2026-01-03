// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> aspect: f32;
@group(0) @binding(2) var<uniform> time: f32;
@group(0) @binding(3) var<uniform> oscType: i32;
@group(0) @binding(4) var<uniform> frequency: i32;
@group(0) @binding(5) var<uniform> speed: f32;
@group(0) @binding(6) var<uniform> rotation: f32;
@group(0) @binding(7) var<uniform> seed: i32;

const PI: f32 = 3.141592653589793;
const TAU: f32 = 6.283185307179586;

// Simple 1D hash for noise
fn hash11(p: f32, s: f32) -> f32 {
    var pv = fract(p * 234.34 + s);
    pv = pv + pv * (pv + 34.23);
    return fract(pv * pv);
}

// Value noise 1D - tiles at integer frequency boundaries
fn tilingNoise1D(x: f32, freq: f32, s: f32) -> f32 {
    // x is in [0, 1] range, scale by frequency
    let p = x * freq;
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);  // smoothstep
    
    // Wrap indices for seamless tiling
    let i0 = (i % freq + freq) % freq;
    let i1 = ((i + 1.0) % freq + freq) % freq;
    
    let a = hash11(i0, s);
    let b = hash11(i1, s);
    
    return mix(a, b, f);
}

// Periodic value function: h/t Etienne Jacob
// https://bleuje.github.io/tutorial2/
// Python: periodic_value(time, value) = normalized_sine((time - value) * tau)
fn periodicValue(t: f32, v: f32) -> f32 {
    return (sin((t - v) * TAU) + 1.0) * 0.5;
}

// Rotate 2D coordinates
fn rotate2D(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let s = sin(angle);
    let c = cos(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

// All oscillator functions return 0->1->0 over t=0..1
fn oscSine(t: f32) -> f32 {
    // Use half-cycle sine: 0->1->0 over t=0..1
    return sin(fract(t) * PI);
}

fn oscLinear(t: f32) -> f32 {
    // Triangle wave: 0->1->0 over t=0..1
    let tf = fract(t);
    return 1.0 - abs(tf * 2.0 - 1.0);
}

fn oscSawtooth(t: f32) -> f32 {
    // Sawtooth: 0->1 over t=0..1
    return fract(t);
}

fn oscSawtoothInv(t: f32) -> f32 {
    // Inverted sawtooth: 1->0 over t=0..1
    return 1.0 - fract(t);
}

fn oscSquare(t: f32) -> f32 {
    // Square wave: 0 or 1
    return step(0.5, fract(t));
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    var res = resolution;
    if (res.x < 1.0) { res = vec2<f32>(1024.0, 1024.0); }
    
    // Normalized coordinates (flip y for WebGPU coordinate system)
    var st = vec2<f32>(position.x, res.y - position.y) / res;
    
    // Center for rotation
    st = st - 0.5;
    st.x = st.x * aspect;
    
    // Apply rotation
    let rotRad = rotation * PI / 180.0;
    st = rotate2D(st, rotRad);
    
    // Spatial position in [0, 1] for noise sampling
    let spatialPos = st.y + 0.5;
    let freq = f32(frequency);
    
    // The oscillator value is based on position along y-axis
    // frequency controls how many bands appear across the image
    // speed controls how fast the animation runs
    let spatialPhase = st.y * freq;
    let timePhase = time * speed;
    let t = spatialPhase + timePhase;
    
    var val: f32;
    if (oscType == 0) {
        // Sine
        val = oscSine(t);
    } else if (oscType == 1) {
        // Linear (triangle)
        val = oscLinear(t);
    } else if (oscType == 2) {
        // Sawtooth
        val = oscSawtooth(t);
    } else if (oscType == 3) {
        // Sawtooth inverted
        val = oscSawtoothInv(t);
    } else if (oscType == 4) {
        // Square
        val = oscSquare(t);
    } else if (oscType == 5) {
        // noise1d - scrolling version of noise2d
        // At t=0, must match noise2d exactly
        // Then scrolls the pattern over time
        let scrollOffset = fract(time * speed);
        let scrolledPos = fract(spatialPos + scrollOffset);
        
        // Same computation as noise2d at t=0
        let timeNoise = tilingNoise1D(scrolledPos, freq, f32(seed) + 12345.0);
        let valueNoise = tilingNoise1D(scrolledPos, freq, f32(seed));
        let scaledTime = periodicValue(0.0, timeNoise) * speed;
        val = periodicValue(scaledTime, valueNoise);
    } else {
        // noise2d (oscType == 6) - two-stage periodic
        // Python: scaled_time = periodic_value(time, time_noise) * speed
        //         result = periodic_value(scaled_time, value_noise)
        
        // Get noise values at this spatial position (same sampling as noise1d)
        let timeNoise = tilingNoise1D(spatialPos, freq, f32(seed) + 12345.0);
        let valueNoise = tilingNoise1D(spatialPos, freq, f32(seed));
        
        // Two-stage periodic: time -> periodic -> scale -> periodic
        let scaledTime = periodicValue(time, timeNoise) * speed;
        val = periodicValue(scaledTime, valueNoise);
    }
    
    return vec4<f32>(vec3<f32>(val), 1.0);
}
