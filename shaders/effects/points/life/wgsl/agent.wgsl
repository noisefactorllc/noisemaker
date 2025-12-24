// Particle Life agent pass - Common Agent Architecture middleware
// Combined force evaluation + integration in single pass
// Reads from global_xyz/vel/rgba + internal data, writes back all 4
// Positions in normalized coords [0,1]

struct Uniforms {
    resolution: vec2f,
    time: f32,
    typeCount: i32,
    attractionScale: f32,
    repulsionScale: f32,
    minRadius: f32,
    maxRadius: f32,
    maxSpeed: f32,
    friction: f32,
    boundaryMode: i32,
    matrixSeed: f32,
    symmetricForces: i32,
    useTypeColor: i32,
}

struct Outputs {
    @location(0) xyz: vec4f,
    @location(1) vel: vec4f,
    @location(2) rgba: vec4f,
    @location(3) data: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(3) var xyzTex: texture_2d<f32>;
@group(0) @binding(4) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;
@group(0) @binding(6) var dataTex: texture_2d<f32>;
@group(0) @binding(7) var forceMatrix: texture_2d<f32>;
@group(0) @binding(8) var inputTex: texture_2d<f32>;

// === HASH FUNCTIONS ===

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

// Type colors (rainbow palette)
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

// === SPATIAL GRID ===

const GRID_SIZE: i32 = 16;

fn getGridCell(pos: vec2f) -> vec2i {
    let cellSize = vec2f(1.0) / f32(GRID_SIZE);
    return vec2i(clamp(pos / cellSize, vec2f(0.0), vec2f(f32(GRID_SIZE - 1))));
}

// === FORCE FUNCTIONS ===

fn radialForce(dist: f32, strength: f32, prefDist: f32, curveShape: f32) -> f32 {
    let normDist = (dist - u.minRadius) / (u.maxRadius - u.minRadius);
    
    // Scale forces to velocity space: force magnitude should be proportional to maxSpeed
    // A full-strength force should produce significant but not instant max velocity
    let forceScale = u.maxSpeed * 10.0;
    
    if (normDist < 0.0) {
        // Inside minRadius: hard repulsion
        return -u.repulsionScale * (1.0 - dist / u.minRadius) * forceScale;
    }
    
    if (normDist > 1.0) {
        // Outside maxRadius: no force
        return 0.0;
    }
    
    // In the interaction band: apply force curve
    var force: f32;
    if (normDist < prefDist) {
        force = strength * (normDist / prefDist);
    } else {
        force = strength * (1.0 - (normDist - prefDist) / (1.0 - prefDist));
    }
    
    // Apply curve shape
    let shaped = sign(force) * pow(abs(force), 1.0 - curveShape * 0.5);
    
    // Scale by attraction/repulsion multipliers and forceScale
    if (shaped > 0.0) {
        return shaped * u.attractionScale * forceScale;
    } else {
        return shaped * u.repulsionScale * forceScale;
    }
}

// === VECTOR HELPERS ===

fn wrapPosition(pos: vec2f) -> vec2f {
    return (pos % 1.0 + 1.0) % 1.0;
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
    let coord = vec2i(position.xy);
    let stateSize = vec2i(textureDimensions(xyzTex, 0));
    
    // Read input state from pipeline
    var xyz = textureLoad(xyzTex, coord, 0);
    var vel = textureLoad(velTex, coord, 0);
    var rgba = textureLoad(rgbaTex, coord, 0);
    var data = textureLoad(dataTex, coord, 0);
    
    // Extract components (normalized coords [0,1])
    let px = xyz.x;
    let py = xyz.y;
    let alive = xyz.w;
    
    var vx = vel.x;
    var vy = vel.y;
    var age = vel.z;
    let seed = vel.w;
    
    var typeId = data.x;
    var mass = data.y;
    
    let particleId = u32(coord.x + coord.y * stateSize.x);
    
    var pos = vec2f(px, py);
    var velocity = vec2f(vx, vy);
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        return Outputs(xyz, vel, rgba, data);
    }
    
    // Initialize data on first use (typeId=0 and mass=0 means uninitialized)
    if (typeId == 0.0 && mass == 0.0) {
        let initSeed = particleId + u32(u.time * 1000.0);
        typeId = floor(hash(initSeed + 4u) * f32(u.typeCount));
        mass = 0.8 + hash(initSeed + 5u) * 0.4;
        
        // Initialize velocity if zero
        if (length(velocity) == 0.0) {
            let angle = hash(initSeed + 2u) * 6.28318530718;
            let speed = hash(initSeed + 3u) * u.maxSpeed * 0.3;
            velocity = vec2f(cos(angle), sin(angle)) * speed;
        }
    }

    // Ensure mass is valid
    mass = max(mass, 0.1);
        // Set color based on type
        rgba = vec4f(typeColor(i32(typeId), u.typeCount), 1.0);
    }
    
    // Attrition is now handled by pointsEmit
    
    // === FORCE EVALUATION ===
    
    var totalForce = vec2f(0.0);
    var neighborCount = 0;
    let myType = i32(typeId);
    
    let myCell = getGridCell(pos);
    let totalParticles = stateSize.x * stateSize.y;
    
    // Sample neighbors using spatial grid
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            var checkCell = myCell + vec2i(dx, dy);
            
            // Wrap cell coordinates
            checkCell = (checkCell + GRID_SIZE) % GRID_SIZE;
            
            let cellSeed = u32(checkCell.y * GRID_SIZE + checkCell.x);
            
            // Sample particles from this cell
            for (var s = 0; s < 12; s++) {
                let sampleSeed = cellSeed * 31u + u32(s) + u32(u.time * 7.0);
                let sampleIdx = i32(hash_uint(sampleSeed) % u32(totalParticles));
                
                let sx = sampleIdx % stateSize.x;
                let sy = sampleIdx / stateSize.x;
                
                // Skip self
                if (sx == coord.x && sy == coord.y) {
                    continue;
                }
                
                // Read neighbor state
                let otherXyz = textureLoad(xyzTex, vec2i(sx, sy), 0);
                let otherData = textureLoad(dataTex, vec2i(sx, sy), 0);
                
                let otherPos = otherXyz.xy;
                let otherAlive = otherXyz.w;
                let otherType = i32(otherData.x);
                
                // Skip dead or uninitialized
                if (otherAlive < 0.5) {
                    continue;
                }
                
                // Calculate distance with wrapping (toroidal)
                var diff = otherPos - pos;
                
                if (diff.x > 0.5) { diff.x -= 1.0; }
                if (diff.x < -0.5) { diff.x += 1.0; }
                if (diff.y > 0.5) { diff.y -= 1.0; }
                if (diff.y < -0.5) { diff.y += 1.0; }
                
                let dist = length(diff);
                
                // Skip if outside max interaction range
                if (dist < 0.0001 || dist > u.maxRadius) {
                    continue;
                }
                
                // Look up force parameters from ForceMatrix
                let forceParams = textureLoad(forceMatrix, vec2i(myType, otherType), 0);
                let strength = forceParams.x;
                let prefDist = forceParams.y;
                let curveShape = forceParams.z;
                
                // Calculate force magnitude
                let forceMag = radialForce(dist, strength, prefDist, curveShape);
                
                // Convert to force vector
                let forceDir = diff / dist;
                totalForce += forceDir * forceMag;
                neighborCount++;
            }
        }
    }
    
    // Normalize by mass
    totalForce /= mass;
    
    // === INTEGRATION ===
    
    // Apply forces
    velocity += totalForce;
    
    // Apply friction/damping
    velocity *= (1.0 - u.friction);
    
    // Limit speed
    velocity = limitVec(velocity, u.maxSpeed);
    
    // Update position
    pos += velocity;
    
    // Handle boundaries
    if (u.boundaryMode == 0) {
        // Wrap (toroidal)
        pos = wrapPosition(pos);
    } else {
        // Bounce
        if (pos.x < 0.0) { pos.x = -pos.x; velocity.x = -velocity.x; }
        if (pos.x > 1.0) { pos.x = 2.0 - pos.x; velocity.x = -velocity.x; }
        if (pos.y < 0.0) { pos.y = -pos.y; velocity.y = -velocity.y; }
        if (pos.y > 1.0) { pos.y = 2.0 - pos.y; velocity.y = -velocity.y; }
        pos = clamp(pos, vec2f(0.001), vec2f(0.999));
    }
    
    // Update age
    age += 0.016;
    
    var outColor = rgba;
    if (u.useTypeColor != 0) {
        outColor = vec4f(typeColor(i32(typeId), u.typeCount), 1.0);
    } else {
        // Sample from input texture based on position
        let inputDims = vec2f(textureDimensions(inputTex));
        let inputCoord = vec2i(pos * inputDims);
        outColor = textureLoad(inputTex, inputCoord, 0);
    }

    // Output updated state
    return Outputs(
        vec4f(pos, 0.0, 1.0),
        vec4f(velocity, age, seed),
        outColor,
        vec4f(typeId, mass, 0.0, 1.0)
    );
}
