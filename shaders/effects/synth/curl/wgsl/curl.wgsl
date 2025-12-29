struct Uniforms {
    resolution: vec2f,
    time: f32,
    aspectRatio: f32,
    scale: f32,
    seed: f32,
    speed: f32,
    strength: f32,
    octaves: f32,
    noiseType: f32,
    outputMode: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

const TAU: f32 = 6.283185307179586;
const EPSILON: f32 = 0.001;

// PCG PRNG
fn pcg(v_in: vec3u) -> vec3u {
    var v = v_in * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v = v ^ (v >> vec3u(16u));
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn prng(p_in: vec3f) -> vec3f {
    var p = p_in;
    p.x = select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0);
    p.y = select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0);
    p.z = select(-p.z * 2.0 + 1.0, p.z * 2.0, p.z >= 0.0);
    return vec3f(pcg(vec3u(p))) / f32(0xffffffffu);
}

// Quintic interpolation for smooth transitions
fn quintic(t: f32) -> f32 {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn smoothlerp(x: f32, a: f32, b: f32) -> f32 {
    return a + quintic(x) * (b - a);
}

// 2D periodic grid function - gradient angle animates with time
fn grid2D(st: vec2f, cell: vec2f) -> f32 {
    var angle = prng(vec3f(cell + u.seed, 1.0)).r * TAU;
    angle = angle + u.time * TAU * u.speed;  // Animate gradient rotation
    let gradient = vec2f(cos(angle), sin(angle));
    let dist = st - cell;
    return dot(gradient, dist);
}

// 2D periodic Perlin noise - time animates gradient angles for seamless loop
fn noise2D(st: vec2f) -> f32 {
    let cell = floor(st);
    let f = fract(st);
    
    let tl = grid2D(st, cell);
    let tr = grid2D(st, vec2f(cell.x + 1.0, cell.y));
    let bl = grid2D(st, vec2f(cell.x, cell.y + 1.0));
    let br = grid2D(st, cell + 1.0);
    
    let upper = smoothlerp(f.x, tl, tr);
    let lower = smoothlerp(f.x, bl, br);
    let val = smoothlerp(f.y, upper, lower);
    
    return val;  // Returns -1..1
}

fn cubic(t: f32) -> f32 {
    return t * t * (3.0 - 2.0 * t);
}

// Value noise functions
fn valueNoise(p: vec2f, t: f32) -> f32 {
    let i = floor(p);
    let f = fract(p);
    
    // Get corner values
    let a = prng(vec3f(i, t + u.seed)).x;
    let b = prng(vec3f(i + vec2f(1.0, 0.0), t + u.seed)).x;
    let c = prng(vec3f(i + vec2f(0.0, 1.0), t + u.seed)).x;
    let d = prng(vec3f(i + vec2f(1.0, 1.0), t + u.seed)).x;
    
    // Interpolate
    var uv: vec2f;
    let noiseTypeInt = i32(u.noiseType);
    if (noiseTypeInt == 1) {
        // Linear
        uv = f;
    } else if (noiseTypeInt == 2) {
        // Hermite (smoothstep)
        uv = vec2f(cubic(f.x), cubic(f.y));
    } else if (noiseTypeInt == 3) {
        // Catmull-Rom (simplified with quintic)
        uv = vec2f(quintic(f.x), quintic(f.y));
    } else {
        uv = f;
    }
    
    let x1 = mix(a, b, uv.x);
    let x2 = mix(c, d, uv.x);
    return mix(x1, x2, uv.y);
}

// Main noise function selector
fn noise(p: vec2f, t: f32) -> f32 {
    let noiseTypeInt = i32(u.noiseType);
    if (noiseTypeInt == 0) {
        // Perlin noise - use time as angle for gradient rotation
        return noise2D(p);
    } else {
        return valueNoise(p, t) * 2.0 - 1.0;
    }
}

// Multi-octave noise (FBM)
fn fbm(p: vec2f, t: f32) -> f32 {
    var value: f32 = 0.0;
    var amplitude: f32 = 0.5;
    var frequency: f32 = 1.0;
    var maxValue: f32 = 0.0;
    
    let oct = clamp(i32(u.octaves), 1, 6);
    
    for (var i: i32 = 0; i < 6; i = i + 1) {
        if (i >= oct) { break; }
        value += amplitude * noise(p * frequency, t);
        maxValue += amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    
    return value / maxValue;
}

// Curl noise: compute curl of potential field
// curl(P) = (dP/dy, -dP/dx) for 2D
fn curlNoise(p: vec2f, t: f32) -> vec2f {
    // Sample noise with small offsets to compute derivatives
    let dx = fbm(p + vec2f(EPSILON, 0.0), t) - fbm(p - vec2f(EPSILON, 0.0), t);
    let dy = fbm(p + vec2f(0.0, EPSILON), t) - fbm(p - vec2f(0.0, EPSILON), t);
    
    // Curl is perpendicular to gradient
    // For 2D: curl = (dP/dy, -dP/dx)
    return vec2f(dy, -dx) / (2.0 * EPSILON);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let st = fragCoord.xy / u.resolution.y;
    let aspect = u.resolution.x / u.resolution.y;
    
    // Center coordinates
    let centered = st - vec2f(aspect * 0.5, 0.5);
    
    // Scale coordinates
    let p = centered * (100.0 / u.scale);
    
    // Animate with time
    let t = u.time * u.speed * 0.1;
    
    // Compute curl noise
    let curl = curlNoise(p, t) * u.strength;
    
    // Visualize the curl field as color
    // Map the 2D vector to RGB
    var color: vec3f;
    
    // Use curl vector components for R and G
    // Normalize to 0-1 range
    color.r = curl.x * 0.5 + 0.5;
    color.g = curl.y * 0.5 + 0.5;
    
    // Blue channel shows the magnitude
    let magnitude = length(curl);
    color.b = magnitude;
    
    // Apply output mode
    let outputInt = i32(u.outputMode);
    if (outputInt == 0) {
        // Flow X
        color = vec3f(color.r);
    } else if (outputInt == 1) {
        // Flow Y
        color = vec3f(color.g);
    } else if (outputInt == 2) {
        // Direction
        color = vec3f(color.r, color.g, 0.0);
    }
    // else outputInt == 3: Direction + Magnitude (default, already set)
    
    return vec4f(color, 1.0);
}
