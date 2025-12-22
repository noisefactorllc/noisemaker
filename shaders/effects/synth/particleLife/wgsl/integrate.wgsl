// WGSL Integration Pass

struct Uniforms {
    resolution: vec2f,
    time: f32,
    resetState: i32,
    maxSpeed: f32,
    friction: f32,
    boundaryMode: i32,
    typeCount: i32,
    colorMode: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var stateTex1: texture_2d<f32>;
@group(0) @binding(2) var stateTex2: texture_2d<f32>;
@group(0) @binding(3) var stateTex3: texture_2d<f32>;
@group(0) @binding(4) var forceTex: texture_2d<f32>;
@group(0) @binding(5) var tex: texture_2d<f32>;
@group(0) @binding(6) var texSampler: sampler;

struct Outputs {
    @location(0) outState1: vec4f,
    @location(1) outState2: vec4f,
    @location(2) outState3: vec4f,
}

fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

fn hash2(seed: u32) -> vec2f {
    return vec2f(hash(seed), hash(seed + 1u));
}

fn typeColor(typeId: i32, totalTypes: i32) -> vec3f {
    let hue = f32(typeId) / f32(totalTypes);
    let h = hue * 6.0;
    let c = 1.0;
    let x = c * (1.0 - abs(h % 2.0 - 1.0));
    var rgb: vec3f;
    if (h < 1.0) { rgb = vec3f(c, x, 0.0); }
    else if (h < 2.0) { rgb = vec3f(x, c, 0.0); }
    else if (h < 3.0) { rgb = vec3f(0.0, c, x); }
    else if (h < 4.0) { rgb = vec3f(0.0, x, c); }
    else if (h < 5.0) { rgb = vec3f(x, 0.0, c); }
    else { rgb = vec3f(c, 0.0, x); }
    return rgb;
}

fn sampleInputColorRaw(uv: vec2f) -> vec3f {
    let flippedUV = vec2f(uv.x, 1.0 - uv.y);
    return textureSample(tex, texSampler, flippedUV).rgb;
}

fn wrapPosition(pos: vec2f, bounds: vec2f) -> vec2f {
    return (pos % bounds + bounds) % bounds;
}

fn limitVec(v: vec2f, maxLen: f32) -> vec2f {
    let len = length(v);
    if (len > maxLen && len > 0.0) {
        return v * (maxLen / len);
    }
    return v;
}

@fragment
fn main(@builtin(position) position: vec4f) -> Outputs {
    let stateSize = vec2i(textureDimensions(stateTex1, 0));
    let coord = vec2i(position.xy);
    
    let state1 = textureLoad(stateTex1, coord, 0);
    let state2 = textureLoad(stateTex2, coord, 0);
    let state3 = textureLoad(stateTex3, coord, 0);
    let force = textureLoad(forceTex, coord, 0);
    
    var pos = state1.xy;
    var vel = state1.zw;
    var typeId = state2.x;
    var mass = state2.y;
    var age = state2.z;
    var color = state3.rgb;
    
    let particleId = u32(coord.y * stateSize.x + coord.x);
    
    // Pre-compute init values for color sampling (uniform control flow)
    let initSeed = particleId + u32(uniforms.time * 1000.0);
    let initPos = hash2(initSeed) * uniforms.resolution;
    let initColor = sampleInputColorRaw(initPos / uniforms.resolution);
    
    let needsInit = uniforms.resetState != 0 || (pos.x == 0.0 && pos.y == 0.0 && length(vel) == 0.0);
    
    if (needsInit) {
        let seed = initSeed;
        pos = initPos;
        
        let angle = hash(seed + 2u) * 6.28318530718;
        let speed = hash(seed + 3u) * uniforms.maxSpeed * 0.3;
        vel = vec2f(cos(angle), sin(angle)) * speed;
        
        typeId = floor(hash(seed + 4u) * f32(uniforms.typeCount));
        mass = 0.8 + hash(seed + 5u) * 0.4;
        age = 0.0;
        
        if (uniforms.colorMode == 0) {
            color = typeColor(i32(typeId), uniforms.typeCount);
        } else {
            color = initColor;
        }
        
        return Outputs(vec4f(pos, vel), vec4f(typeId, mass, age, 1.0), vec4f(color, 1.0));
    }
    
    // Apply forces
    let accel = force.xy;
    vel += accel;
    vel *= (1.0 - uniforms.friction);
    vel = limitVec(vel, uniforms.maxSpeed);
    pos += vel;
    
    // Handle boundaries
    if (uniforms.boundaryMode == 0) {
        pos = wrapPosition(pos, uniforms.resolution);
    } else {
        if (pos.x < 0.0) { pos.x = -pos.x; vel.x = -vel.x; }
        if (pos.x > uniforms.resolution.x) { pos.x = 2.0 * uniforms.resolution.x - pos.x; vel.x = -vel.x; }
        if (pos.y < 0.0) { pos.y = -pos.y; vel.y = -vel.y; }
        if (pos.y > uniforms.resolution.y) { pos.y = 2.0 * uniforms.resolution.y - pos.y; vel.y = -vel.y; }
        pos = clamp(pos, vec2f(1.0), uniforms.resolution - vec2f(1.0));
    }
    
    age += 0.016;
    
    return Outputs(vec4f(pos, vel), vec4f(typeId, mass, age, 1.0), vec4f(color, 1.0));
}
