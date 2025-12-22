struct Uniforms {
    resolution: vec2f,
    attractor: i32,
    density: f32,
    speed: f32,
    scale: f32,
    time: f32,
    resetState: f32,
    colorMode: i32,  // 0 = mono (white), 1 = sample from tex
}

struct Outputs {
    @location(0) state1: vec4f,
    @location(1) state2: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var stateTex1: texture_2d<f32>;
@group(0) @binding(2) var stateTex2: texture_2d<f32>;
@group(0) @binding(3) var tex: texture_2d<f32>;
@group(0) @binding(4) var inputSampler: sampler;

fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

// Lorenz attractor (classic butterfly)
fn lorenz(p: vec3f) -> vec3f {
    let sigma = 10.0;
    let rho = 28.0;
    let beta = 8.0 / 3.0;
    return vec3f(
        sigma * (p.y - p.x),
        p.x * (rho - p.z) - p.y,
        p.x * p.y - beta * p.z
    );
}

// Rössler attractor (spiral)
fn rossler(p: vec3f) -> vec3f {
    let a = 0.2;
    let b = 0.2;
    let c = 5.7;
    return vec3f(
        -p.y - p.z,
        p.x + a * p.y,
        b + p.z * (p.x - c)
    );
}

// Aizawa attractor (torus-like)
fn aizawa(p: vec3f) -> vec3f {
    let a = 0.95;
    let b = 0.7;
    let c = 0.6;
    let d = 3.5;
    let e = 0.25;
    let f = 0.1;
    return vec3f(
        (p.z - b) * p.x - d * p.y,
        d * p.x + (p.z - b) * p.y,
        c + a * p.z - (p.z * p.z * p.z) / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z) + f * p.z * p.x * p.x * p.x
    );
}

// Thomas attractor (cyclically symmetric)
fn thomas(p: vec3f) -> vec3f {
    let b = 0.208186;
    return vec3f(
        sin(p.y) - b * p.x,
        sin(p.z) - b * p.y,
        sin(p.x) - b * p.z
    );
}

// Halvorsen attractor (3-fold symmetric)
fn halvorsen(p: vec3f) -> vec3f {
    let a = 1.89;
    return vec3f(
        -a * p.x - 4.0 * p.y - 4.0 * p.z - p.y * p.y,
        -a * p.y - 4.0 * p.z - 4.0 * p.x - p.z * p.z,
        -a * p.z - 4.0 * p.x - 4.0 * p.y - p.x * p.x
    );
}

// Chen attractor (double scroll)
fn chen(p: vec3f) -> vec3f {
    let a = 40.0;
    let b = 3.0;
    let c = 28.0;
    return vec3f(
        a * (p.y - p.x),
        (c - a) * p.x - p.x * p.z + c * p.y,
        p.x * p.y - b * p.z
    );
}

// Dadras attractor (4-wing)
fn dadras(p: vec3f) -> vec3f {
    let a = 3.0;
    let b = 2.7;
    let c = 1.7;
    let d = 2.0;
    let e = 9.0;
    return vec3f(
        p.y - a * p.x + b * p.y * p.z,
        c * p.y - p.x * p.z + p.z,
        d * p.x * p.y - e * p.z
    );
}

fn stepAttractor(p: vec3f, attractorType: i32, dt: f32) -> vec3f {
    var dp: vec3f;
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
fn main(@builtin(position) fragCoord: vec4f) -> Outputs {
    let coord = vec2i(fragCoord.xy);
    let width = i32(u.resolution.x);
    let height = i32(u.resolution.y);
    
    let state1 = textureLoad(stateTex1, coord, 0);
    let state2 = textureLoad(stateTex2, coord, 0);
    
    var px = state1.x;
    var py = state1.y;
    var pz = state1.z;
    var cr = state2.x;
    var cg = state2.y;
    var cb = state2.z;
    var seed_f = state2.w;
    
    let agentSeed = u32(coord.x + coord.y * width);
    let agentIndex = coord.x + coord.y * width;
    let totalAgents = width * height;
    let maxParticles = i32(f32(totalAgents) * u.density * 0.01);
    
    let isActive = agentIndex < maxParticles;
    
    // Compute random init values unconditionally (WGSL uniform control flow)
    let initSeed = agentSeed + u32(u.time * 1000.0);
    let initPx = (hash(initSeed) - 0.5) * 20.0;
    let initPy = (hash(initSeed + 1u) - 0.5) * 20.0;
    let initPz = hash(initSeed + 2u) * 30.0 + 10.0;
    let sampleUV = vec2f(hash(initSeed + 3u), hash(initSeed + 4u));
    let sampledColor = textureSample(tex, inputSampler, sampleUV);
    let inputColor = select(sampledColor.rgb, vec3f(1.0), u.colorMode == 0);
    let initSeedF = hash(initSeed + 5u);
    
    // Check if needs initialization or reset
    if (state1.w < 0.5 || u.resetState > 0.5) {
        px = initPx;
        py = initPy;
        pz = initPz;
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        seed_f = initSeedF;
        
        return Outputs(
            vec4f(px, py, pz, 1.0),
            vec4f(cr, cg, cb, seed_f)
        );
    }
    
    if (!isActive) {
        return Outputs(state1, state2);
    }
    
    // Step the attractor
    let dt = u.speed * 0.01;
    var pos = vec3f(px, py, pz);
    pos = stepAttractor(pos, u.attractor, dt);
    
    // Check for divergence
    if (any(pos != pos) || length(pos) > 1000.0) {
        // Reinitialize
        pos = vec3f(initPx, initPy, initPz);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
    }
    
    return Outputs(
        vec4f(pos, 1.0),
        vec4f(cr, cg, cb, seed_f)
    );
}
