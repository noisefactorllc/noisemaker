/*
 * Flow3D agent pass (WGSL) - 3D GPGPU agent simulation with MRT output
 * 
 * Agent format:
 * - state1: [x, y, z, rotRand]     - 3D position + rotation randomness
 * - state2: [r, g, b, seed]        - color + seed
 * - state3: [age, initialized, theta, phi] - age, init flag, spherical angles
 */

struct Outputs {
    @location(0) outState1: vec4<f32>,
    @location(1) outState2: vec4<f32>,
    @location(2) outState3: vec4<f32>,
}

@group(0) @binding(0) var stateTex1: texture_2d<f32>;
@group(0) @binding(1) var stateTex2: texture_2d<f32>;
@group(0) @binding(2) var stateTex3: texture_2d<f32>;
@group(0) @binding(3) var mixerTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> stride: f32;
@group(0) @binding(5) var<uniform> strideDeviation: f32;
@group(0) @binding(6) var<uniform> kink: f32;
@group(0) @binding(7) var<uniform> time: f32;
@group(0) @binding(8) var<uniform> lifetime: f32;
@group(0) @binding(9) var<uniform> behavior: f32;
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

// Sample 3D volume with trilinear interpolation
fn sampleVolume(pos: vec3<f32>, volSize: i32) -> vec4<f32> {
    let volSizeF = f32(volSize);
    let texelPos = clamp(pos, vec3<f32>(0.0), vec3<f32>(volSizeF - 1.0));
    let texelFloor = floor(texelPos);
    let frac = texelPos - texelFloor;
    
    let i0 = vec3<i32>(texelFloor);
    let i1 = min(i0 + 1, vec3<i32>(volSize - 1));
    
    let c000 = textureLoad(mixerTex, atlasTexel(vec3<i32>(i0.x, i0.y, i0.z), volSize), 0);
    let c100 = textureLoad(mixerTex, atlasTexel(vec3<i32>(i1.x, i0.y, i0.z), volSize), 0);
    let c010 = textureLoad(mixerTex, atlasTexel(vec3<i32>(i0.x, i1.y, i0.z), volSize), 0);
    let c110 = textureLoad(mixerTex, atlasTexel(vec3<i32>(i1.x, i1.y, i0.z), volSize), 0);
    let c001 = textureLoad(mixerTex, atlasTexel(vec3<i32>(i0.x, i0.y, i1.z), volSize), 0);
    let c101 = textureLoad(mixerTex, atlasTexel(vec3<i32>(i1.x, i0.y, i1.z), volSize), 0);
    let c011 = textureLoad(mixerTex, atlasTexel(vec3<i32>(i0.x, i1.y, i1.z), volSize), 0);
    let c111 = textureLoad(mixerTex, atlasTexel(vec3<i32>(i1.x, i1.y, i1.z), volSize), 0);
    
    let c00 = mix(c000, c100, frac.x);
    let c10 = mix(c010, c110, frac.x);
    let c01 = mix(c001, c101, frac.x);
    let c11 = mix(c011, c111, frac.x);
    
    let c0 = mix(c00, c10, frac.y);
    let c1 = mix(c01, c11, frac.y);
    
    return mix(c0, c1, frac.z);
}

fn getFallbackColor(pos: vec3<f32>, seed: u32) -> vec3<f32> {
    var col = hash3(seed + u32(pos.x * 10.0 + pos.y * 100.0 + pos.z * 1000.0));
    col = col * 0.5 + 0.25 + hash3(seed) * 0.25;
    return clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
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

fn computeRotationBias(behaviorMode: i32, baseHeading: f32, baseRotRand: f32, time: f32, agentIndex: i32, totalAgents: i32) -> f32 {
    if (behaviorMode <= 0) {
        return 0.0;
    } else if (behaviorMode == 1) {
        return baseHeading;
    } else if (behaviorMode == 2) {
        return baseHeading + floor(baseRotRand * 6.0) * (TAU / 6.0);
    } else if (behaviorMode == 3) {
        return baseHeading + (baseRotRand - 0.5) * 0.25;
    } else if (behaviorMode == 4) {
        return baseRotRand * TAU;
    } else if (behaviorMode == 5) {
        let quarterSize = max(1, totalAgents / 4);
        let band = agentIndex / quarterSize;
        if (band <= 0) {
            return baseHeading;
        } else if (band == 1) {
            return baseHeading + floor(baseRotRand * 6.0) * (TAU / 6.0);
        } else if (band == 2) {
            return baseHeading + (baseRotRand - 0.5) * 0.25;
        } else {
            return baseRotRand * TAU;
        }
    } else if (behaviorMode == 10) {
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
    var theta = state3.z;
    var phi = state3.w;
    
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
        theta = hash(agentSeed + 300u) * TAU;
        phi = acos(2.0 * hash(agentSeed + 400u) - 1.0);
        
        let inputColor = sampleVolume(vec3<f32>(flow_x, flow_y, flow_z), volSize);
        
        if (length(inputColor.rgb) < 0.01) {
            let fallbackCol = getFallbackColor(vec3<f32>(flow_x, flow_y, flow_z), agentSeed);
            cr = fallbackCol.r;
            cg = fallbackCol.g;
            cb = fallbackCol.b;
        } else {
            cr = inputColor.r;
            cg = inputColor.g;
            cb = inputColor.b;
        }
        
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
        theta = hash(baseSeed + 300u) * TAU;
        phi = acos(2.0 * hash(baseSeed + 400u) - 1.0);
        
        let inputColor = sampleVolume(vec3<f32>(flow_x, flow_y, flow_z), volSize);
        
        if (length(inputColor.rgb) < 0.01) {
            let fallbackCol = getFallbackColor(vec3<f32>(flow_x, flow_y, flow_z), baseSeed);
            cr = fallbackCol.r;
            cg = fallbackCol.g;
            cb = fallbackCol.b;
        } else {
            cr = inputColor.r;
            cg = inputColor.g;
            cb = inputColor.b;
        }
        
        age = 0.0;
    }
    
    // Sample input for flow direction
    let texel = sampleVolume(vec3<f32>(flow_x, flow_y, flow_z), volSize);
    
    var indexValue: f32;
    if (length(texel.rgb) < 0.01) {
        indexValue = hash(u32(flow_x * 10.0 + flow_y * 100.0 + flow_z * 1000.0 + time * 10.0));
    } else {
        indexValue = oklab_l(texel.rgb);
    }
    
    let baseHeading = hash(0u) * TAU;
    let behaviorMode = i32(behavior);
    let rotationBias = computeRotationBias(behaviorMode, baseHeading, rotRand, time, agentIndex, totalAgents);
    
    theta = theta + indexValue * TAU * kink * 0.1 + rotationBias * 0.1;
    phi = phi + (indexValue - 0.5) * PI * kink * 0.1;
    phi = clamp(phi, 0.01, PI - 0.01);
    
    let sinPhi = sin(phi);
    let cosPhi = cos(phi);
    let sinTheta = sin(theta);
    let cosTheta = cos(theta);
    
    let direction = vec3<f32>(
        sinPhi * cosTheta,
        sinPhi * sinTheta,
        cosPhi
    );
    
    let scale = max(volSizeF / 64.0, 1.0);
    let strideRand = hash(agentSeed + 500u) - 0.5;
    let devFactor = 1.0 + strideRand * 2.0 * strideDeviation;
    let actualStride = max(0.1, stride * scale * devFactor);
    
    var newX = flow_x + direction.x * actualStride;
    var newY = flow_y + direction.y * actualStride;
    var newZ = flow_z + direction.z * actualStride;
    
    newX = wrap_float(newX, volSizeF);
    newY = wrap_float(newY, volSizeF);
    newZ = wrap_float(newZ, volSizeF);
    
    age = age + 0.016;
    
    output.outState1 = vec4<f32>(newX, newY, newZ, rotRand);
    output.outState2 = vec4<f32>(cr, cg, cb, seed_f);
    output.outState3 = vec4<f32>(age, initialized, theta, phi);
    
    return output;
}
