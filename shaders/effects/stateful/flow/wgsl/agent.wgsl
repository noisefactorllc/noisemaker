// Flow agent pass - GPGPU agent simulation with MRT output
// Agent format: state1=[x, y, rotRand, strideRand] state2=[r, g, b, seed] state3=[age, initialized, 0, 0]
// rotRand/strideRand are per-agent random values; behavior is computed each frame from uniform
// Matches GLSL agent.glsl algorithm exactly

struct Outputs {
    @location(0) outState1: vec4<f32>,
    @location(1) outState2: vec4<f32>,
    @location(2) outState3: vec4<f32>,
}

@group(0) @binding(0) var stateTex1: texture_2d<f32>;
@group(0) @binding(1) var stateTex2: texture_2d<f32>;
@group(0) @binding(2) var stateTex3: texture_2d<f32>;
@group(0) @binding(3) var inputTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> resolution: vec2<f32>;
@group(0) @binding(5) var<uniform> stride: f32;
@group(0) @binding(6) var<uniform> strideDeviation: f32;
@group(0) @binding(7) var<uniform> kink: f32;
@group(0) @binding(8) var<uniform> quantize: f32;
@group(0) @binding(9) var<uniform> time: f32;
@group(0) @binding(10) var<uniform> lifetime: f32;
@group(0) @binding(11) var<uniform> behavior: f32;
@group(0) @binding(12) var<uniform> resetState: i32;
// Note: density is only used in deposit pass, not here

const TAU : f32 = 6.283185307179586;
const RIGHT_ANGLE : f32 = 1.5707963267948966;

fn hash_uint(seed : u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed : u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

fn hash2(seed : u32) -> vec2<f32> {
    return vec2<f32>(hash(seed), hash(seed + 1u));
}

fn wrap_float(value : f32, size : f32) -> f32 {
    if (size <= 0.0) { return 0.0; }
    let scaled = floor(value / size);
    var wrapped = value - scaled * size;
    if (wrapped < 0.0) { wrapped = wrapped + size; }
    return wrapped;
}

fn wrap_int(value : i32, size : i32) -> i32 {
    if (size <= 0) { return 0; }
    var result = value % size;
    if (result < 0) { result = result + size; }
    return result;
}

fn srgb_to_linear(value : f32) -> f32 {
    if (value <= 0.04045) { return value / 12.92; }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn cube_root(value : f32) -> f32 {
    if (value == 0.0) { return 0.0; }
    let sign_value = select(-1.0, 1.0, value >= 0.0);
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

fn oklab_l(rgb : vec3<f32>) -> f32 {
    let r_lin = srgb_to_linear(clamp(rgb.x, 0.0, 1.0));
    let g_lin = srgb_to_linear(clamp(rgb.y, 0.0, 1.0));
    let b_lin = srgb_to_linear(clamp(rgb.z, 0.0, 1.0));
    let l = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    let m = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    let s = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;
    return 0.2104542553 * cube_root(l) + 0.7936177850 * cube_root(m) - 0.0040720468 * cube_root(s);
}

fn normalized_sine(value : f32) -> f32 {
    return (sin(value) + 1.0) * 0.5;
}

// Compute rotation bias based on behavior mode
// Called EVERY FRAME to allow behavior changes to take effect immediately
// baseRotRand is per-agent random [0,1] stored in state
fn computeRotationBias(behaviorMode : i32, baseHeading : f32, baseRotRand : f32, time : f32, agentIndex : i32, totalAgents : i32) -> f32 {
    if (behaviorMode <= 0) {
        // None: all face right (no rotation bias)
        return 0.0;
    } else if (behaviorMode == 1) {
        // Obedient: all same direction
        return baseHeading;
    } else if (behaviorMode == 2) {
        // Crosshatch: 4 cardinal directions based on per-agent random
        return baseHeading + floor(baseRotRand * 4.0) * RIGHT_ANGLE;
    } else if (behaviorMode == 3) {
        // Unruly: small deviation from base
        return baseHeading + (baseRotRand - 0.5) * 0.25;
    } else if (behaviorMode == 4) {
        // Chaotic: random direction
        return baseRotRand * TAU;
    } else if (behaviorMode == 5) {
        // Random Mix: divide agents into 4 quarters with different behaviors
        let quarterSize = max(1, totalAgents / 4);
        let band = agentIndex / quarterSize;
        if (band <= 0) {
            return baseHeading;  // Obedient
        } else if (band == 1) {
            return baseHeading + floor(baseRotRand * 4.0) * RIGHT_ANGLE;  // Crosshatch
        } else if (band == 2) {
            return baseHeading + (baseRotRand - 0.5) * 0.25;  // Unruly
        } else {
            return baseRotRand * TAU;  // Chaotic
        }
    } else if (behaviorMode == 10) {
        // Meandering: time-varying sine rotation using per-agent phase
        return normalized_sine((time - baseRotRand) * TAU);
    } else {
        return baseRotRand * TAU;
    }
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> Outputs {
    var output : Outputs;
    
    let coord = vec2<i32>(position.xy);
    let width = i32(resolution.x);
    let height = i32(resolution.y);
    
    // Read current agent state
    let state1 = textureLoad(stateTex1, coord, 0);
    let state2 = textureLoad(stateTex2, coord, 0);
    let state3 = textureLoad(stateTex3, coord, 0);
    
    var flow_x = state1.x;
    var flow_y = state1.y;
    var rotRand = state1.z;  // Per-agent random [0,1] for rotation variation
    var strideRand = state1.w;  // Per-agent random value [-0.5, 0.5] for stride variation
    var cr = state2.x;
    var cg = state2.y;
    var cb = state2.z;
    var seed_f = state2.w;
    var age = state3.x;
    var initialized = state3.y;
    
    let agentSeed = u32(coord.x + coord.y * width);
    let baseSeed = agentSeed + u32(time * 1000.0);
    
    // Compute total agent count for Random Mix behavior
    let totalAgents = width * height;  // Max possible agents (texture size)
    let agentIndex = coord.x + coord.y * width;
    
    // Check if this agent needs initialization or reset requested
    if (initialized < 0.5 || resetState != 0) {
        let pos = hash2(agentSeed);
        flow_x = pos.x * f32(width);
        flow_y = pos.y * f32(height);
        
        // Store per-agent random [0,1] for rotation variation
        // Actual rotation computed each frame based on current behavior uniform
        rotRand = hash(agentSeed + 200u);
        
        // Store per-agent random value for stride deviation
        // Actual deviation factor computed each frame using strideDeviation uniform
        strideRand = hash(agentSeed + 300u) - 0.5;  // Range [-0.5, 0.5]
        
        let xi = wrap_int(i32(flow_x), width);
        let yi = wrap_int(i32(flow_y), height);
        let inputColor = textureLoad(inputTex, vec2<i32>(xi, yi), 0);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        seed_f = f32(agentSeed);
        age = 0.0;
        initialized = 1.0;
    }
    
    // Check for respawn based on lifetime (literal seconds)
    // Each agent gets a staggered start based on index so they don't all respawn at once
    let agentPhase = f32(agentIndex) / f32(max(totalAgents, 1));
    let staggeredAge = age + agentPhase * lifetime;
    
    let shouldRespawn = lifetime > 0.0 && staggeredAge >= lifetime;
    
    if (shouldRespawn) {
        // Respawn at new random location
        let pos = hash2(baseSeed);
        flow_x = pos.x * f32(width);
        flow_y = pos.y * f32(height);
        
        // New random for rotation variation
        rotRand = hash(baseSeed + 200u);
        
        // Sample new color
        let xi = wrap_int(i32(flow_x), width);
        let yi = wrap_int(i32(flow_y), height);
        let inputColor = textureLoad(inputTex, vec2<i32>(xi, yi), 0);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        age = 0.0;
    }
    
    // Sample input texture at current position
    let xi = wrap_int(i32(flow_x), width);
    let yi = wrap_int(i32(flow_y), height);
    let texel = textureLoad(inputTex, vec2<i32>(xi, yi), 0);
    let indexValue = oklab_l(texel.rgb);
    
    // Compute rotation bias based on behavior uniform (computed each frame!)
    // baseHeading is constant across all agents (seed 0)
    let baseHeading = hash(0u) * TAU;
    let behaviorMode = i32(behavior);
    let rotationBias = computeRotationBias(behaviorMode, baseHeading, rotRand, time, agentIndex, totalAgents);
    
    var finalAngle = indexValue * TAU * kink + rotationBias;
    
    if (quantize > 0.5) {
        finalAngle = round(finalAngle);
    }
    
    // Compute actual stride: uniform stride * resolution scale * per-agent deviation
    // strideRand is per-agent random [-0.5, 0.5], strideDeviation uniform controls magnitude
    let scale = max(f32(max(width, height)) / 1024.0, 1.0);
    let devFactor = 1.0 + strideRand * 2.0 * strideDeviation;
    let actualStride = max(0.1, stride * scale * devFactor);
    
    // Move agent
    var newX = flow_x + sin(finalAngle) * actualStride;
    var newY = flow_y + cos(finalAngle) * actualStride;
    
    newX = wrap_float(newX, f32(width));
    newY = wrap_float(newY, f32(height));
    
    age = age + 0.016;
    
    output.outState1 = vec4<f32>(newX, newY, rotRand, strideRand);
    output.outState2 = vec4<f32>(cr, cg, cb, seed_f);
    output.outState3 = vec4<f32>(age, initialized, 0.0, 0.0);
    
    return output;
}
