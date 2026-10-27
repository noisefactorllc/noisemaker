/*
 * Flow3D agent pass (WGSL) - 3D GPGPU agent simulation with MRT output
 * 
 * Agent format:
 * - state1: [x, y, z, rotRand]     - 3D position + rotation randomness
 * - state2: [r, g, b, seed]        - color + seed
 * - state3: [age, initialized, strideRand, 0] - age, init flag, per-agent stride random
 */

struct Outputs {
    @location(0) outState1: vec4<f32>,
    @location(1) outState2: vec4<f32>,
    @location(2) outState3: vec4<f32>,
}

// BEHAVIOR is a compile-time const injected by the runtime via injectDefines
// (see definition.js `globals.behavior.define`). Same fix as the GLSL
// backend — emits only one rotation-bias branch per compiled program. The
// old `behavior` binding at @group(0) @binding(9) is removed.

@group(0) @binding(0) var stateTex1: texture_2d<f32>;
@group(0) @binding(1) var stateTex2: texture_2d<f32>;
@group(0) @binding(2) var stateTex3: texture_2d<f32>;
@group(0) @binding(3) var mixerTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> stride: f32;
@group(0) @binding(5) var<uniform> strideDeviation: f32;
@group(0) @binding(6) var<uniform> kink: f32;
@group(0) @binding(7) var<uniform> time: f32;
@group(0) @binding(8) var<uniform> lifetime: f32;
@group(0) @binding(10) var<uniform> volumeSize: i32;

const TAU: f32 = 6.283185307179586;
const PI: f32 = 3.141592653589793;
const RIGHT_ANGLE: f32 = 1.5707963267948966;

fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

fn hash3(seed: u32) -> vec3<f32> {
    return vec3<f32>(hash(seed), hash(seed + 1u), hash(seed + 2u));
}

fn wrap_float(value: f32, size: f32) -> f32 {
    if (size <= 0.0) { return 0.0; }
    let scaled = floor(value / size);
    var wrapped = value - scaled * size;
    if (wrapped < 0.0) { wrapped = wrapped + size; }
    return wrapped;
}

fn wrap_int(value: i32, size: i32) -> i32 {
    if (size <= 0) { return 0; }
    var result = value % size;
    if (result < 0) { result = result + size; }
    return result;
}

// Convert 3D voxel coord to 2D atlas texel coord
fn atlasTexel(p: vec3<i32>, volSize: i32) -> vec2<i32> {
    let clamped = clamp(p, vec3<i32>(0), vec3<i32>(volSize - 1));
    return vec2<i32>(clamped.x, clamped.y + clamped.z * volSize);
}

// Sample 3D volume at integer voxel position (matching 2D texelFetch pattern)
fn sampleVoxel(voxel: vec3<i32>, volSize: i32) -> vec4<f32> {
    let clamped = clamp(voxel, vec3<i32>(0), vec3<i32>(volSize - 1));
    return textureLoad(mixerTex, atlasTexel(clamped, volSize), 0);
}

fn srgb_to_linear(value: f32) -> f32 {
    if (value <= 0.04045) { return value / 12.92; }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn cube_root(value: f32) -> f32 {
    if (value == 0.0) { return 0.0; }
    let sign_value = select(-1.0, 1.0, value >= 0.0);
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

fn oklab_l(rgb: vec3<f32>) -> f32 {
    let r_lin = srgb_to_linear(clamp(rgb.x, 0.0, 1.0));
    let g_lin = srgb_to_linear(clamp(rgb.y, 0.0, 1.0));
    let b_lin = srgb_to_linear(clamp(rgb.z, 0.0, 1.0));
    let l = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    let m = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    let s = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;
    return 0.2104542553 * cube_root(l) + 0.7936177850 * cube_root(m) - 0.0040720468 * cube_root(s);
}

fn normalized_sine(value: f32) -> f32 {
    return (sin(value) + 1.0) * 0.5;
}

fn computeRotationBias(baseHeading: f32, baseRotRand: f32, time: f32, agentIndex: i32, totalAgents: i32) -> f32 {
    if (BEHAVIOR <= 0) {
        return 0.0;
    } else if (BEHAVIOR == 1) {
        return baseHeading;
    } else if (BEHAVIOR == 2) {
        // Crosshatch: 4 cardinal directions (PI/2 spacing) to match the 2D
        // reference in points/flow and the GLSL flow3d backend.
        return baseHeading + floor(baseRotRand * 4.0) * RIGHT_ANGLE;
    } else if (BEHAVIOR == 3) {
        return baseHeading + (baseRotRand - 0.5) * 0.25;
    } else if (BEHAVIOR == 4) {
        return baseRotRand * TAU;
    } else if (BEHAVIOR == 5) {
        let quarterSize = max(1, totalAgents / 4);
        let band = agentIndex / quarterSize;
        if (band <= 0) {
            return baseHeading;
        } else if (band == 1) {
            // Also 4 cardinal directions for parity with 2D reference.
            return baseHeading + floor(baseRotRand * 4.0) * RIGHT_ANGLE;
        } else if (band == 2) {
            return baseHeading + (baseRotRand - 0.5) * 0.25;
        } else {
            return baseRotRand * TAU;
        }
    } else if (BEHAVIOR == 10) {
        return normalized_sine((time - baseRotRand) * TAU);
    } else {
        return baseRotRand * TAU;
    }
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> Outputs {
    var output: Outputs;
    
    let coord = vec2<i32>(position.xy);
    // Use actual state texture size, not canvas resolution
    let stateTexSize = textureDimensions(stateTex1, 0);
    let width = i32(stateTexSize.x);
    let height = i32(stateTexSize.y);
    
    let volSize = volumeSize;
    let volSizeF = f32(volSize);
    
    let state1 = textureLoad(stateTex1, coord, 0);
    let state2 = textureLoad(stateTex2, coord, 0);
    let state3 = textureLoad(stateTex3, coord, 0);
    
    var flow_x = state1.x;
    var flow_y = state1.y;
    var flow_z = state1.z;
    var rotRand = state1.w;
    var cr = state2.x;
    var cg = state2.y;
    var cb = state2.z;
    var seed_f = state2.w;
    var age = state3.x;
    var initialized = state3.y;
    var strideRand = state3.z;  // Per-agent random [-0.5, 0.5] for stride variation
    
    let agentSeed = u32(coord.x + coord.y * width);
    let baseSeed = agentSeed + u32(time * 1000.0);
    
    let totalAgents = width * height;
    let agentIndex = coord.x + coord.y * width;
    
    // Initialize agent if needed
    if (initialized < 0.5) {
        let pos = hash3(agentSeed);
        flow_x = pos.x * volSizeF;
        flow_y = pos.y * volSizeF;
        flow_z = pos.z * volSizeF;
        
        rotRand = hash(agentSeed + 200u);
        strideRand = hash(agentSeed + 300u) - 0.5;
        
        let xi = wrap_int(i32(flow_x), volSize);
        let yi = wrap_int(i32(flow_y), volSize);
        let zi = wrap_int(i32(flow_z), volSize);
        let inputColor = sampleVoxel(vec3<i32>(xi, yi, zi), volSize);
        
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        seed_f = f32(agentSeed);
        age = 0.0;
        initialized = 1.0;
    }
    
    // Check for respawn
    let agentPhase = f32(agentIndex) / f32(max(totalAgents, 1));
    let staggeredAge = age + agentPhase * lifetime;
    let shouldRespawn = lifetime > 0.0 && staggeredAge >= lifetime;
    
    if (shouldRespawn) {
        let pos = hash3(baseSeed);
        flow_x = pos.x * volSizeF;
        flow_y = pos.y * volSizeF;
        flow_z = pos.z * volSizeF;
        
        rotRand = hash(baseSeed + 200u);
        
        let xi = wrap_int(i32(flow_x), volSize);
        let yi = wrap_int(i32(flow_y), volSize);
        let zi = wrap_int(i32(flow_z), volSize);
        let inputColor = sampleVoxel(vec3<i32>(xi, yi, zi), volSize);
        
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        age = 0.0;
    }
    
    // Sample input texture at current position for flow direction
    let xi = wrap_int(i32(flow_x), volSize);
    let yi = wrap_int(i32(flow_y), volSize);
    let zi = wrap_int(i32(flow_z), volSize);
    let texel = sampleVoxel(vec3<i32>(xi, yi, zi), volSize);
    
    let indexValue = oklab_l(texel.rgb);
    
    let baseHeading = hash(0u) * TAU;
    let rotationBias = computeRotationBias(baseHeading, rotRand, time, agentIndex, totalAgents);
    
    // For 3D: azimuth angle (XY plane) - direct extension of 2D angle
    let azimuth = indexValue * TAU * kink + rotationBias;

    // Elevation: use indexValue to modulate vertical movement
    let elevation = (indexValue - 0.5) * PI * kink * 0.5;
    
    let cosElev = cos(elevation);
    
    
    let scale = max(volSizeF / 64.0, 1.0);
    let devFactor = 1.0 + strideRand * 2.0 * strideDeviation;
    let actualStride = max(0.1, stride * scale * devFactor);
    
    var newX = flow_x + sin(azimuth) * cosElev * actualStride;
    var newY = flow_y + cos(azimuth) * cosElev * actualStride;
    var newZ = flow_z + sin(elevation) * actualStride;
    
    newX = wrap_float(newX, volSizeF);
    newY = wrap_float(newY, volSizeF);
    newZ = wrap_float(newZ, volSizeF);
    
    age = age + 0.016;
    
    output.outState1 = vec4<f32>(newX, newY, newZ, rotRand);
    output.outState2 = vec4<f32>(cr, cg, cb, seed_f);
    output.outState3 = vec4<f32>(age, initialized, strideRand, 0.0);
    
    return output;
}
