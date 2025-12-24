// Flock agent pass - Common Agent Architecture middleware
// Reads from global_xyz/vel/rgba, applies boids flocking, writes back
// State format: xyz=[x, y, z, alive] vel=[vx, vy, age, seed] rgba=[r, g, b, a]
// Positions in normalized coords [0,1]

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
}

struct Outputs {
    @location(0) xyz: vec4f,
    @location(1) vel: vec4f,
    @location(2) rgba: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(3) var xyzTex: texture_2d<f32>;
@group(0) @binding(4) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;

// === ORIGINAL BOIDS HELPER FUNCTIONS (PRESERVED EXACTLY) ===

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

const GRID_SIZE: i32 = 16;

fn getGridCell(pos: vec2f, res: vec2f) -> vec2i {
    let cellSize = res / f32(GRID_SIZE);
    return vec2i(clamp(pos / cellSize, vec2f(0.0), vec2f(f32(GRID_SIZE - 1))));
}

// === END ORIGINAL HELPER FUNCTIONS ===

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> Outputs {
    let coord = vec2i(fragCoord.xy);
    let stateSize = textureDimensions(xyzTex, 0);
    
    // Read input state from pipeline
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);
    
    // Extract components
    let px = xyz.x;  // normalized x
    let py = xyz.y;  // normalized y
    let alive = xyz.w;
    
    // vel stores: [vx, vy, age, seed]
    var vx = vel.x;
    var vy = vel.y;
    var age = vel.z;
    var seed = vel.w;
    
    let boidId = u32(coord.x) + u32(coord.y) * u32(stateSize.x);
    
    // Convert normalized to pixel coords for the algorithm
    var pos = vec2f(px, py) * u.resolution;
    var velocity = vec2f(vx, vy);
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        return Outputs(xyz, vel, rgba);
    }
    
    // Initialize velocity on first use (if zero from pointsEmit)
    if (length(velocity) == 0.0 && seed == 0.0) {
        seed = hash(boidId + 99999u);
        let angle = hash(boidId + 12345u) * 6.28318530718;
        let speed = hash(boidId + 23456u) * u.maxSpeed * 0.5 + u.maxSpeed * 0.25;
        velocity = vec2f(cos(angle), sin(angle)) * speed;
    }
    
    // Attrition is now handled by pointsEmit

    // === ORIGINAL BOIDS ALGORITHM (PRESERVED EXACTLY) ===
    
    var separationForce = vec2f(0.0);
    var alignmentSum = vec2f(0.0);
    var cohesionSum = vec2f(0.0);
    var separationCount = 0;
    var alignmentCount = 0;
    var cohesionCount = 0;
    
    let myCell = getGridCell(pos, u.resolution);
    let perceptionSq = u.perceptionRadius * u.perceptionRadius;
    let separationSq = u.separationRadius * u.separationRadius;
    
    let totalBoids = i32(stateSize.x * stateSize.y);
    
    // Sample neighbors
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            var checkCell = myCell + vec2i(dx, dy);
            
            if (u.boundaryMode == 0) {
                checkCell = (checkCell + GRID_SIZE) % GRID_SIZE;
            } else {
                checkCell = clamp(checkCell, vec2i(0), vec2i(GRID_SIZE - 1));
            }
            
            let cellSeed = u32(checkCell.y * GRID_SIZE + checkCell.x);
            
            for (var s = 0; s < 8; s++) {
                let sampleSeed = cellSeed * 31u + u32(s) + u32(u.time * 10.0);
                let sampleIdx = i32(hash_uint(sampleSeed) % u32(totalBoids));
                
                let sx = sampleIdx % i32(stateSize.x);
                let sy = sampleIdx / i32(stateSize.x);
                
                // Skip self
                if (sx == coord.x && sy == coord.y) {
                    continue;
                }
                
                let otherXyz = textureLoad(xyzTex, vec2i(sx, sy), 0);
                let otherVel = textureLoad(velTex, vec2i(sx, sy), 0);
                
                // Skip dead agents
                if (otherXyz.w < 0.5) {
                    continue;
                }
                
                let otherPos = otherXyz.xy * u.resolution;
                let otherVelocity = otherVel.xy;
                
                // Calculate distance (with wrapping if needed)
                var diff = otherPos - pos;
                if (u.boundaryMode == 0) {
                    if (diff.x > u.resolution.x * 0.5) { diff.x -= u.resolution.x; }
                    if (diff.x < -u.resolution.x * 0.5) { diff.x += u.resolution.x; }
                    if (diff.y > u.resolution.y * 0.5) { diff.y -= u.resolution.y; }
                    if (diff.y < -u.resolution.y * 0.5) { diff.y += u.resolution.y; }
                }
                
                let distSq = dot(diff, diff);
                
                // Separation (close neighbors)
                if (distSq < separationSq && distSq > 0.0) {
                    let away = -diff;
                    let dist = sqrt(distSq);
                    separationForce += away / dist;
                    separationCount++;
                }
                
                // Alignment and Cohesion (perception radius)
                if (distSq < perceptionSq && distSq > 0.0) {
                    alignmentSum += otherVelocity;
                    alignmentCount++;
                    cohesionSum += otherPos;
                    cohesionCount++;
                }
            }
        }
    }
    
    // Calculate steering forces
    var steer = vec2f(0.0);
    
    // Separation
    if (separationCount > 0) {
        var sepForce = separationForce / f32(separationCount);
        if (length(sepForce) > 0.0) {
            sepForce = setMag(sepForce, u.maxSpeed);
            sepForce = sepForce - velocity;
            sepForce = limitVec(sepForce, u.maxForce);
            steer += sepForce * u.separation;
        }
    }
    
    // Alignment
    if (alignmentCount > 0) {
        var avgVel = alignmentSum / f32(alignmentCount);
        if (length(avgVel) > 0.0) {
            avgVel = setMag(avgVel, u.maxSpeed);
            var alignSteer = avgVel - velocity;
            alignSteer = limitVec(alignSteer, u.maxForce);
            steer += alignSteer * u.alignment;
        }
    }
    
    // Cohesion
    if (cohesionCount > 0) {
        let avgPos = cohesionSum / f32(cohesionCount);
        var desired = avgPos - pos;
        if (length(desired) > 0.0) {
            desired = setMag(desired, u.maxSpeed);
            var cohesionSteer = desired - velocity;
            cohesionSteer = limitVec(cohesionSteer, u.maxForce);
            steer += cohesionSteer * u.cohesion;
        }
    }
    
    // Noise/turbulence
    if (u.noiseWeight > 0.0) {
        let noiseScale = 0.01;
        let nx = noise2D(pos * noiseScale + u.time * 0.5);
        let ny = noise2D(pos * noiseScale + vec2f(100.0, 100.0) + u.time * 0.5);
        let noiseForce = vec2f(nx, ny) * u.maxForce * u.noiseWeight;
        steer += noiseForce;
    }
    
    // Boundary handling
    if (u.boundaryMode == 1) {
        var wallForce = vec2f(0.0);
        let turnStrength = u.maxForce * 2.0;
        
        if (pos.x < u.wallMargin) {
            wallForce.x = turnStrength * (1.0 - pos.x / u.wallMargin);
        } else if (pos.x > u.resolution.x - u.wallMargin) {
            wallForce.x = -turnStrength * (1.0 - (u.resolution.x - pos.x) / u.wallMargin);
        }
        
        if (pos.y < u.wallMargin) {
            wallForce.y = turnStrength * (1.0 - pos.y / u.wallMargin);
        } else if (pos.y > u.resolution.y - u.wallMargin) {
            wallForce.y = -turnStrength * (1.0 - (u.resolution.y - pos.y) / u.wallMargin);
        }
        
        steer += wallForce;
    }
    
    // Apply steering and update velocity
    velocity += steer;
    velocity = limitVec(velocity, u.maxSpeed);
    
    // Update position
    pos += velocity;
    
    // Boundary wrap
    if (u.boundaryMode == 0) {
        pos = wrapPosition(pos, u.resolution);
    } else {
        pos = clamp(pos, vec2f(1.0), u.resolution - vec2f(1.0));
    }
    
    // Update age
    age += 0.016;
    
    // === END ORIGINAL ALGORITHM ===
    
    // Convert back to normalized coords
    let newPx = pos.x / u.resolution.x;
    let newPy = pos.y / u.resolution.y;
    
    return Outputs(
        vec4f(newPx, newPy, xyz.z, 1.0),
        vec4f(velocity, age, seed),
        rgba
    );
}
