struct Uniforms {
    resolution: vec2f,
    time: f32,
    gravity: f32,
    wind: f32,
    energy: f32,
    drag: f32,
    stride: f32,
    wander: f32,
}

struct Outputs {
    @location(0) xyz: vec4f,
    @location(1) vel: vec4f,
    @location(2) rgba: vec4f,
}

// Bindings: uniforms at 0, then state textures consecutively (textureLoad, no samplers)
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(2) var velTex: texture_2d<f32>;
@group(0) @binding(3) var rgbaTex: texture_2d<f32>;

fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

// Smooth noise for wander perturbation
fn noise2D(p: vec2f) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);  // Smoothstep
    
    let n = u32(i.x) + u32(i.y) * 57u;
    let a = hash(n);
    let b = hash(n + 1u);
    let c = hash(n + 57u);
    let d = hash(n + 58u);
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal noise for smoother motion
fn fbm(p_in: vec2f) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var p = p_in;
    for (var i = 0; i < 3; i++) {
        v += a * noise2D(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> Outputs {
    let coord = vec2i(fragCoord.xy);
    let stateSize = textureDimensions(xyzTex, 0);
    
    // Read input state from pipeline
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);
    
    // Extract components
    var px = xyz.x;  // Position in normalized coords [0,1]
    var py = xyz.y;
    let pz = xyz.z;
    let alive = xyz.w;
    
    var vx = vel.x;
    var vy = vel.y;
    let vz = vel.z;
    let seed_f = vel.w;
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        return Outputs(xyz, vel, rgba);
    }
    
    // Per-particle stride variation (0 = all same speed, 1 = highly varied)
    let strideMultiplier = 1.0 + (seed_f - 0.5) * u.stride * 2.0;
    
    // Smooth wander perturbation using noise field
    let noiseScale = 2.0;  // Adjust for normalized coords
    let wanderAngle = fbm(vec2f(px, py) * noiseScale + u.time * 0.5) * 6.283185 * 2.0;
    let wanderStrength = u.wander * 0.002;  // Scaled for normalized coords
    let wanderX = cos(wanderAngle) * wanderStrength;
    let wanderY = sin(wanderAngle) * wanderStrength;
    
    // Physics forces (scaled for normalized coords)
    // Use energy as a global multiplier for visible movement
    let ax = (u.wind * 0.01 + wanderX) * u.energy;
    let ay = (-u.gravity * 0.01 + wanderY) * u.energy;  // Negate: positive gravity pulls down
    
    // Update velocity with stride variation
    vx += ax * strideMultiplier;
    vy += ay * strideMultiplier;
    
    // Apply drag coefficient (0 = no drag, 0.2 = heavy drag)
    let dragFactor = 1.0 - u.drag;
    vx *= dragFactor;
    vy *= dragFactor;
    
    // Update position (stride already factored into velocity)
    px += vx;
    py += vy;
    
    // Check for respawn conditions
    var needsRespawn = false;
    
    // Respawn if out of bounds (normalized coords)
    if (px < 0.0 || px > 1.0 || py < 0.0 || py > 1.0) {
        needsRespawn = true;
    }
    
    // Attrition is now handled by pointsEmit
    
    if (needsRespawn) {
        // Signal respawn by setting alive flag to 0
        // pointsEmit will handle actual respawn on next frame
        return Outputs(
            vec4f(px, py, pz, 0.0),
            vec4f(vx, vy, vz, seed_f),
            rgba
        );
    } else {
        return Outputs(
            vec4f(px, py, pz, 1.0),
            vec4f(vx, vy, vz, seed_f),
            rgba
        );
    }
}
