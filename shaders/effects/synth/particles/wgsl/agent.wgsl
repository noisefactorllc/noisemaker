struct Uniforms {
    resolution: vec2f,
    gravity: f32,
    wind: f32,
    energy: f32,
    drag: f32,
    stride: f32,
    wander: f32,
    attrition: f32,
    density: f32,
    time: f32,
    resetState: f32,
}

struct Outputs {
    @location(0) state1: vec4f,
    @location(1) state2: vec4f,
    @location(2) state3: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var stateTex1: texture_2d<f32>;
@group(0) @binding(2) var stateTex2: texture_2d<f32>;
@group(0) @binding(3) var stateTex3: texture_2d<f32>;
@group(0) @binding(4) var inputTex: texture_2d<f32>;
@group(0) @binding(5) var inputSampler: sampler;

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
    let width = i32(u.resolution.x);
    let height = i32(u.resolution.y);
    
    let state1 = textureLoad(stateTex1, coord, 0);
    let state2 = textureLoad(stateTex2, coord, 0);
    let state3 = textureLoad(stateTex3, coord, 0);
    
    var px = state1.x;
    var py = state1.y;
    var vx = state1.z;
    var vy = state1.w;
    var cr = state2.x;
    var cg = state2.y;
    var cb = state2.z;
    var seed_f = state2.w;
    var age = state3.x;
    var particleEnergy = state3.y;
    
    let agentSeed = u32(coord.x + coord.y * width);
    let agentIndex = coord.x + coord.y * width;
    let totalAgents = width * height;
    let maxParticles = i32(f32(totalAgents) * u.density * 0.01);
    
    let isActive = agentIndex < maxParticles;
    
    // Compute respawn position and sample color unconditionally (WGSL uniform control flow requirement)
    let respawnSeed = agentSeed + u32(u.time * 1000.0);
    let respawnPx = hash(respawnSeed) * u.resolution.x;
    let respawnPy = hash(respawnSeed + 1u) * u.resolution.y;
    let respawnAngle = hash(respawnSeed + 2u) * 6.283185;
    let respawnSpeed = hash(respawnSeed + 3u) * u.energy * 2.0;
    let respawnVx = cos(respawnAngle) * respawnSpeed;
    let respawnVy = sin(respawnAngle) * respawnSpeed;
    let respawnSeedF = hash(respawnSeed + 4u);
    
    // Sample input color at respawn position (must be in uniform control flow)
    let sampleUV = vec2f(respawnPx, respawnPy) / u.resolution;
    let inputColor = textureSample(inputTex, inputSampler, sampleUV);
    
    // Check if needs initialization or reset
    if (state3.z < 0.5 || u.resetState > 0.5) {
        px = respawnPx;
        py = respawnPy;
        vx = respawnVx;
        vy = respawnVy;
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        seed_f = respawnSeedF;
        age = 0.0;
        particleEnergy = 1.0;
        
        return Outputs(
            vec4f(px, py, vx, vy),
            vec4f(cr, cg, cb, seed_f),
            vec4f(age, particleEnergy, 1.0, 0.0)
        );
    }
    
    if (!isActive) {
        return Outputs(state1, state2, state3);
    }
    
    // Per-particle stride variation (0 = all same speed, 1 = highly varied)
    let strideMultiplier = 1.0 + (seed_f - 0.5) * u.stride * 2.0;
    
    // Smooth wander perturbation using noise field
    let noiseScale = 0.01;
    let wanderAngle = fbm(vec2f(px, py) * noiseScale + u.time * 0.5) * 6.283185 * 2.0;
    let wanderStrength = u.wander * 0.5;
    let wanderX = cos(wanderAngle) * wanderStrength;
    let wanderY = sin(wanderAngle) * wanderStrength;
    
    // Apply physics
    let ax = u.wind + wanderX;
    let ay = -u.gravity + wanderY;  // Negate: positive gravity pulls down (decreasing Y in GL coords)
    
    vx += ax * strideMultiplier;
    vy += ay * strideMultiplier;
    
    // Apply drag coefficient (0 = no drag, 0.2 = heavy drag)
    let dragFactor = 1.0 - u.drag;
    vx *= dragFactor;
    vy *= dragFactor;
    
    // Update position with stride
    px += vx * strideMultiplier;
    py += vy * strideMultiplier;
    
    // Update age and energy
    age += 0.01;
    particleEnergy -= u.attrition * 0.001;
    
    // Check for respawn conditions
    var needsRespawn = false;
    
    // Out of bounds
    if (px < 0.0 || px >= u.resolution.x || py < 0.0 || py >= u.resolution.y) {
        needsRespawn = true;
    }
    
    if (particleEnergy <= 0.0) {
        needsRespawn = true;
    }
    
    if (needsRespawn) {
        px = respawnPx;
        py = respawnPy;
        vx = respawnVx;
        vy = respawnVy;
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        age = 0.0;
        particleEnergy = 1.0;
    }
    
    return Outputs(
        vec4f(px, py, vx, vy),
        vec4f(cr, cg, cb, seed_f),
        vec4f(age, particleEnergy, 1.0, 0.0)
    );
}
