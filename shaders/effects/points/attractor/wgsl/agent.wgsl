// Strange Attractors Agent Shader
// Updates particle positions based on attractor dynamics

struct Uniforms {
    time: f32,
    resolution: vec2<f32>,
    seed: i32,
    attractor: i32,
    speed: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(3) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;

struct Outputs {
    @location(0) outXYZ: vec4<f32>,
    @location(1) outVel: vec4<f32>,
    @location(2) outRGBA: vec4<f32>,
};

// Integer-based hash for cross-platform determinism
fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

// Lorenz attractor (classic butterfly)
fn lorenz(p: vec3<f32>) -> vec3<f32> {
    let sigma = 10.0;
    let rho = 28.0;
    let beta = 8.0 / 3.0;
    return vec3<f32>(
        sigma * (p.y - p.x),
        p.x * (rho - p.z) - p.y,
        p.x * p.y - beta * p.z
    );
}

// Rössler attractor (spiral)
fn rossler(p: vec3<f32>) -> vec3<f32> {
    let a = 0.2;
    let b = 0.2;
    let c = 5.7;
    return vec3<f32>(
        -p.y - p.z,
        p.x + a * p.y,
        b + p.z * (p.x - c)
    );
}

// Aizawa attractor (torus-like)
fn aizawa(p: vec3<f32>) -> vec3<f32> {
    let a = 0.95;
    let b = 0.7;
    let c = 0.6;
    let d = 3.5;
    let e = 0.25;
    let f = 0.1;
    return vec3<f32>(
        (p.z - b) * p.x - d * p.y,
        d * p.x + (p.z - b) * p.y,
        c + a * p.z - (p.z * p.z * p.z) / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z) + f * p.z * p.x * p.x * p.x
    );
}

// Thomas attractor (cyclically symmetric)
fn thomas(p: vec3<f32>) -> vec3<f32> {
    let b = 0.208186;
    return vec3<f32>(
        sin(p.y) - b * p.x,
        sin(p.z) - b * p.y,
        sin(p.x) - b * p.z
    );
}

// Halvorsen attractor (3-fold symmetric)
fn halvorsen(p: vec3<f32>) -> vec3<f32> {
    let a = 1.89;
    return vec3<f32>(
        -a * p.x - 4.0 * p.y - 4.0 * p.z - p.y * p.y,
        -a * p.y - 4.0 * p.z - 4.0 * p.x - p.z * p.z,
        -a * p.z - 4.0 * p.x - 4.0 * p.y - p.x * p.x
    );
}

// Chen attractor (double scroll)
fn chen(p: vec3<f32>) -> vec3<f32> {
    let a = 40.0;
    let b = 3.0;
    let c = 28.0;
    return vec3<f32>(
        a * (p.y - p.x),
        (c - a) * p.x - p.x * p.z + c * p.y,
        p.x * p.y - b * p.z
    );
}

// Dadras attractor (4-wing)
fn dadras(p: vec3<f32>) -> vec3<f32> {
    let a = 3.0;
    let b = 2.7;
    let c = 1.7;
    let d = 2.0;
    let e = 9.0;
    return vec3<f32>(
        p.y - a * p.x + b * p.y * p.z,
        c * p.y - p.x * p.z + p.z,
        d * p.x * p.y - e * p.z
    );
}

fn stepAttractor(p: vec3<f32>, attractorType: i32, dt: f32) -> vec3<f32> {
    var dp: vec3<f32>;
    if (attractorType == 0) { dp = lorenz(p); }
    else if (attractorType == 1) { dp = rossler(p); }
    else if (attractorType == 2) { dp = aizawa(p); }
    else if (attractorType == 3) { dp = thomas(p); }
    else if (attractorType == 4) { dp = halvorsen(p); }
    else if (attractorType == 5) { dp = chen(p); }
    else { dp = dadras(p); }
    
    return p + dp * dt;
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> Outputs {
    let coord = vec2<i32>(fragCoord.xy);
    let texSize = textureDimensions(xyzTex, 0);
    let stateSize = i32(texSize.x);
    
    // Read current state
    let pos = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let col = textureLoad(rgbaTex, coord, 0);
    
    let agentSeed = u32(coord.x + coord.y * stateSize) + u32(u.seed);
    
    // Check if needs 3D initialization
    // pointsEmit initializes agents in 2D normalized coords (0-1 range for x,y, z=0)
    // We detect this by checking if z is exactly 0.0 (never happens in attractor space)
    // and position is in the 0-1 range typical of pointsEmit output
    let needs3DInit = pos.w >= 0.5 && pos.z == 0.0 && pos.x >= 0.0 && pos.x <= 1.0 && pos.y >= 0.0 && pos.y <= 1.0;
    
    if (needs3DInit) {
        let initSeed = agentSeed + u32(u.time * 1000.0);
        let newX = (hash(initSeed) - 0.5) * 20.0;
        let newY = (hash(initSeed + 1u) - 0.5) * 20.0;
        let newZ = hash(initSeed + 2u) * 30.0 + 10.0;
        
        return Outputs(
            vec4<f32>(newX, newY, newZ, 1.0),
            vel,
            col
        );
    }
    
    // Skip dead agents
    if (pos.w < 0.5) {
        return Outputs(pos, vel, col);
    }
    
    // Step the attractor
    let dt = u.speed * 0.01;
    var newPos = stepAttractor(pos.xyz, u.attractor, dt);
    
    // Check for divergence (NaN or too far)
    // WGSL: check for NaN by comparing value to itself (NaN != NaN)
    let hasNaN = newPos.x != newPos.x || newPos.y != newPos.y || newPos.z != newPos.z;
    if (hasNaN || length(newPos) > 1000.0) {
        let respawnSeed = agentSeed + u32(u.time * 1000.0);
        newPos = vec3<f32>(
            (hash(respawnSeed) - 0.5) * 20.0,
            (hash(respawnSeed + 1u) - 0.5) * 20.0,
            hash(respawnSeed + 2u) * 30.0 + 10.0
        );
    }
    
    return Outputs(
        vec4<f32>(newPos, 1.0),
        vel,
        col
    );
}
