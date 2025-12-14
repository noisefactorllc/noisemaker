// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> aspect: f32;
@group(0) @binding(2) var<uniform> time: f32;
@group(0) @binding(3) var<uniform> oscType: i32;
@group(0) @binding(4) var<uniform> frequency: i32;
@group(0) @binding(5) var<uniform> speed: f32;
@group(0) @binding(6) var<uniform> rotation: f32;
@group(0) @binding(7) var<uniform> seed: f32;

const PI: f32 = 3.141592653589793;
const TAU: f32 = 6.283185307179586;

// Simple 2D hash for noise
fn hash21(p_in: vec2<f32>, s: f32) -> f32 {
    var p = fract(p_in * vec2<f32>(234.34, 435.345) + s);
    p = p + dot(p, p + 34.23);
    return fract(p.x * p.y);
}

// Value noise 2D
fn noise2D(p: vec2<f32>, s: f32) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    let a = hash21(i, s);
    let b = hash21(i + vec2<f32>(1.0, 0.0), s);
    let c = hash21(i + vec2<f32>(0.0, 1.0), s);
    let d = hash21(i + vec2<f32>(1.0, 1.0), s);
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Looping noise - samples on a circle for seamless temporal loops
fn loopingNoise(spatial: f32, temporal: f32, s: f32) -> f32 {
    // temporal is 0..1 over one loop cycle
    // Sample noise on a circle so start meets end
    let angle = temporal * TAU;
    let radius = 2.0;  // Controls noise detail in time dimension
    let loopCoord = vec2<f32>(cos(angle), sin(angle)) * radius;
    // Combine with spatial coordinate
    let coord = vec3<f32>(spatial * 5.0, loopCoord);
    // Use 2D noise slices combined for pseudo-3D
    let n1 = noise2D(coord.xy + s, s);
    let n2 = noise2D(vec2<f32>(coord.x, coord.z) + s * 2.0, s);
    return mix(n1, n2, 0.5);
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
    
    // The oscillator value is based on position along y-axis
    // frequency controls how many bands appear across the image
    // speed controls how fast the animation runs
    let spatialPhase = st.y * f32(frequency);
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
    } else {
        // noise (oscType == 5) - seamlessly looping
        let spatial = st.y * f32(frequency);
        let temporal = fract(time * speed);
        val = loopingNoise(spatial, temporal, seed);
    }
    
    return vec4<f32>(vec3<f32>(val), 1.0);
}
