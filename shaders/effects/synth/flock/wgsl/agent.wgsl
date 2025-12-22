// WGSL Boids Agent Shader

struct Uniforms {
    resolution: vec2f,
    time: f32,
    separation: f32,
    alignment: f32,
    cohesion: f32,
    perceptionRadius: f32,
    separationRadius: f32,
    maxSpeed: f32,
    maxForce: f32,
    boundaryMode: i32,
    wallMargin: f32,
    noiseWeight: f32,
    attrition: f32,
    colorMode: i32,
    resetState: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var stateTex1: texture_2d<f32>;
@group(0) @binding(2) var stateTex2: texture_2d<f32>;
@group(0) @binding(3) var tex: texture_2d<f32>;
@group(0) @binding(4) var texSampler: sampler;

struct Outputs {
    @location(0) outState1: vec4f,
    @location(1) outState2: vec4f,
}

// Hash functions
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

fn hashFloat(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453123);
}

fn noise2D(p: vec2f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let ff = f * f * (3.0 - 2.0 * f);
    let n = i.x + i.y * 57.0;
    return mix(
        mix(hashFloat(n), hashFloat(n + 1.0), ff.x),
        mix(hashFloat(n + 57.0), hashFloat(n + 58.0), ff.x),
        ff.y
    ) * 2.0 - 1.0;
}

fn wrapPosition(position: vec2f, bounds: vec2f) -> vec2f {
    return (position % bounds + bounds) % bounds;
}

fn limitVec(v: vec2f, maxLen: f32) -> vec2f {
    let len = length(v);
    if (len > maxLen && len > 0.0) {
        return v * (maxLen / len);
    }
    return v;
}

fn setMag(v: vec2f, mag: f32) -> vec2f {
    let len = length(v);
    if (len > 0.0) {
        return v * (mag / len);
    }
    return v;
}

fn sampleInputColorRaw(uv: vec2f) -> vec3f {
    let flippedUV = vec2f(uv.x, 1.0 - uv.y);
    return textureSample(tex, texSampler, flippedUV).rgb;
}

fn applyColorMode(sampledColor: vec3f) -> vec3f {
    if (uniforms.colorMode == 0) {
        return vec3f(1.0);
    }
    return sampledColor;
}

const GRID_SIZE: i32 = 16;

fn getGridCell(pos: vec2f) -> vec2i {
    let cellSize = uniforms.resolution / f32(GRID_SIZE);
    return vec2i(clamp(pos / cellSize, vec2f(0.0), vec2f(f32(GRID_SIZE - 1))));
}

@fragment
fn main(@builtin(position) position: vec4f) -> Outputs {
    let stateSize = vec2i(textureDimensions(stateTex1, 0));
    let stateUV = (position.xy + vec2f(0.5)) / vec2f(stateSize);
    
    // Use textureLoad for state textures to avoid sampler issues
    let state1 = textureLoad(stateTex1, vec2i(position.xy), 0);
    let state2 = textureLoad(stateTex2, vec2i(position.xy), 0);
    
    var pos = state1.xy;
    var vel = state1.zw;
    var color = state2.rgb;
    var age = state2.a;
    
    let boidId = u32(position.y * f32(stateSize.x) + position.x);
    
    // Pre-compute positions for color sampling (uniform control flow)
    // Initial position
    let initSeed = boidId + u32(uniforms.time * 1000.0);
    let initPos = hash2(initSeed) * uniforms.resolution;
    
    // Respawn position 
    let time_seed = u32(uniforms.time * 60.0);
    let check_seed = boidId + time_seed * 747796405u;
    let pos_seed = check_seed ^ 2891336453u;
    let respawnPos = hash2(pos_seed) * uniforms.resolution;
    
    // Sample colors at both positions BEFORE any non-uniform branching
    let initColor = sampleInputColorRaw(initPos / uniforms.resolution);
    let respawnColor = sampleInputColorRaw(respawnPos / uniforms.resolution);
    
    // Now do the logic with flags instead of early returns
    var needsInit = uniforms.resetState != 0 || (pos.x == 0.0 && pos.y == 0.0 && length(vel) == 0.0);
    var needsRespawn = false;
    
    if (!needsInit && uniforms.attrition > 0.0) {
        let respawnRand = hash(check_seed);
        let attritionRate = uniforms.attrition * 0.01;
        needsRespawn = respawnRand < attritionRate;
    }
    
    // Handle initialization
    if (needsInit) {
        pos = initPos;
        let angle = hash(initSeed + 2u) * 6.28318530718;
        let speed = hash(initSeed + 3u) * uniforms.maxSpeed * 0.5 + uniforms.maxSpeed * 0.25;
        vel = vec2f(cos(angle), sin(angle)) * speed;
        age = hash(initSeed + 4u) * 10.0;
        color = applyColorMode(initColor);
        
        return Outputs(vec4f(pos, vel), vec4f(color, age));
    }
    
    // Handle attrition respawn
    if (needsRespawn) {
        pos = respawnPos;
        let angle = hash(pos_seed + 2u) * 6.28318530718;
        vel = vec2f(cos(angle), sin(angle)) * uniforms.maxSpeed * 0.5;
        age = 0.0;
        color = applyColorMode(respawnColor);
        
        return Outputs(vec4f(pos, vel), vec4f(color, age));
    }
    
    // Boids algorithm
    var separationForce = vec2f(0.0);
    var alignmentSum = vec2f(0.0);
    var cohesionSum = vec2f(0.0);
    var separationCount = 0;
    var alignmentCount = 0;
    var cohesionCount = 0;
    
    let myCell = getGridCell(pos);
    let perceptionSq = uniforms.perceptionRadius * uniforms.perceptionRadius;
    let separationSq = uniforms.separationRadius * uniforms.separationRadius;
    
    let totalBoids = stateSize.x * stateSize.y;
    
    // Sample neighbors
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            var checkCell = myCell + vec2i(dx, dy);
            
            if (uniforms.boundaryMode == 0) {
                checkCell = (checkCell + GRID_SIZE) % GRID_SIZE;
            } else {
                checkCell = clamp(checkCell, vec2i(0), vec2i(GRID_SIZE - 1));
            }
            
            let cellSeed = u32(checkCell.y * GRID_SIZE + checkCell.x);
            
            for (var s = 0; s < 8; s++) {
                let sampleSeed = cellSeed * 31u + u32(s) + u32(uniforms.time * 10.0);
                let sampleIdx = i32(hash_uint(sampleSeed) % u32(totalBoids));
                
                let sx = sampleIdx % stateSize.x;
                let sy = sampleIdx / stateSize.x;
                
                if (sx == i32(position.x) && sy == i32(position.y)) {
                    continue;
                }
                
                let otherState1 = textureLoad(stateTex1, vec2i(sx, sy), 0);
                let otherPos = otherState1.xy;
                let otherVel = otherState1.zw;
                
                var diff = otherPos - pos;
                if (uniforms.boundaryMode == 0) {
                    if (diff.x > uniforms.resolution.x * 0.5) { diff.x -= uniforms.resolution.x; }
                    if (diff.x < -uniforms.resolution.x * 0.5) { diff.x += uniforms.resolution.x; }
                    if (diff.y > uniforms.resolution.y * 0.5) { diff.y -= uniforms.resolution.y; }
                    if (diff.y < -uniforms.resolution.y * 0.5) { diff.y += uniforms.resolution.y; }
                }
                
                let distSq = dot(diff, diff);
                
                if (distSq < separationSq && distSq > 0.0) {
                    let away = -diff;
                    let dist = sqrt(distSq);
                    separationForce += away / dist;
                    separationCount++;
                }
                
                if (distSq < perceptionSq && distSq > 0.0) {
                    alignmentSum += otherVel;
                    alignmentCount++;
                    cohesionSum += otherPos;
                    cohesionCount++;
                }
            }
        }
    }
    
    // Calculate steering forces
    var steer = vec2f(0.0);
    
    if (separationCount > 0) {
        var sepForce = separationForce / f32(separationCount);
        if (length(sepForce) > 0.0) {
            sepForce = setMag(sepForce, uniforms.maxSpeed);
            sepForce = sepForce - vel;
            sepForce = limitVec(sepForce, uniforms.maxForce);
            steer += sepForce * uniforms.separation;
        }
    }
    
    if (alignmentCount > 0) {
        var avgVel = alignmentSum / f32(alignmentCount);
        if (length(avgVel) > 0.0) {
            avgVel = setMag(avgVel, uniforms.maxSpeed);
            var alignSteer = avgVel - vel;
            alignSteer = limitVec(alignSteer, uniforms.maxForce);
            steer += alignSteer * uniforms.alignment;
        }
    }
    
    if (cohesionCount > 0) {
        let avgPos = cohesionSum / f32(cohesionCount);
        var desired = avgPos - pos;
        if (length(desired) > 0.0) {
            desired = setMag(desired, uniforms.maxSpeed);
            var cohesionSteer = desired - vel;
            cohesionSteer = limitVec(cohesionSteer, uniforms.maxForce);
            steer += cohesionSteer * uniforms.cohesion;
        }
    }
    
    // Noise
    if (uniforms.noiseWeight > 0.0) {
        let noiseScale = 0.01;
        let nx = noise2D(pos * noiseScale + uniforms.time * 0.5);
        let ny = noise2D(pos * noiseScale + vec2f(100.0, 100.0) + uniforms.time * 0.5);
        let noiseForce = vec2f(nx, ny) * uniforms.maxForce * uniforms.noiseWeight;
        steer += noiseForce;
    }
    
    // Boundary handling
    if (uniforms.boundaryMode == 1) {
        var wallForce = vec2f(0.0);
        let turnStrength = uniforms.maxForce * 2.0;
        
        if (pos.x < uniforms.wallMargin) {
            wallForce.x = turnStrength * (1.0 - pos.x / uniforms.wallMargin);
        } else if (pos.x > uniforms.resolution.x - uniforms.wallMargin) {
            wallForce.x = -turnStrength * (1.0 - (uniforms.resolution.x - pos.x) / uniforms.wallMargin);
        }
        
        if (pos.y < uniforms.wallMargin) {
            wallForce.y = turnStrength * (1.0 - pos.y / uniforms.wallMargin);
        } else if (pos.y > uniforms.resolution.y - uniforms.wallMargin) {
            wallForce.y = -turnStrength * (1.0 - (uniforms.resolution.y - pos.y) / uniforms.wallMargin);
        }
        
        steer += wallForce;
    }
    
    // Update velocity and position
    vel += steer;
    vel = limitVec(vel, uniforms.maxSpeed);
    pos += vel;
    
    if (uniforms.boundaryMode == 0) {
        pos = wrapPosition(pos, uniforms.resolution);
    } else {
        pos = clamp(pos, vec2f(1.0), uniforms.resolution - vec2f(1.0));
    }
    
    age += 0.016;
    
    return Outputs(vec4f(pos, vel), vec4f(color, age));
}
