// WGSL Pairwise Force Evaluation Pass

struct Uniforms {
    resolution: vec2f,
    time: f32,
    typeCount: i32,
    attractionScale: f32,
    repulsionScale: f32,
    minRadius: f32,
    maxRadius: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var stateTex1: texture_2d<f32>;
@group(0) @binding(2) var stateTex2: texture_2d<f32>;
@group(0) @binding(3) var forceMatrix: texture_2d<f32>;

fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

const GRID_SIZE: i32 = 16;

fn getGridCell(pos: vec2f, bounds: vec2f) -> vec2i {
    let cellSize = bounds / f32(GRID_SIZE);
    return vec2i(clamp(pos / cellSize, vec2f(0.0), vec2f(f32(GRID_SIZE - 1))));
}

fn radialForce(dist: f32, strength: f32, prefDist: f32, curveShape: f32, minR: f32, maxR: f32, attrScale: f32, repScale: f32) -> f32 {
    let normDist = (dist - minR) / (maxR - minR);
    
    if (normDist < 0.0) {
        return -repScale * (1.0 - dist / minR);
    }
    
    if (normDist > 1.0) {
        return 0.0;
    }
    
    var force: f32;
    if (normDist < prefDist) {
        force = strength * (normDist / prefDist);
    } else {
        force = strength * (1.0 - (normDist - prefDist) / (1.0 - prefDist));
    }
    
    let shaped = sign(force) * pow(abs(force), 1.0 - curveShape * 0.5);
    
    if (shaped > 0.0) {
        return shaped * attrScale;
    } else {
        return shaped * repScale;
    }
}

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let stateSize = vec2i(textureDimensions(stateTex1, 0));
    let coord = vec2i(position.xy);
    
    let state1 = textureLoad(stateTex1, coord, 0);
    let state2 = textureLoad(stateTex2, coord, 0);
    
    let pos = state1.xy;
    let myType = i32(state2.x);
    let myMass = max(state2.y, 0.1);
    
    // Skip uninitialized
    if (pos.x == 0.0 && pos.y == 0.0 && state1.z == 0.0 && state1.w == 0.0) {
        return vec4f(0.0);
    }
    
    var totalForce = vec2f(0.0);
    var neighborCount = 0;
    
    let totalParticles = stateSize.x * stateSize.y;
    let particleId = u32(coord.y * stateSize.x + coord.x);
    
    let myCell = getGridCell(pos, uniforms.resolution);
    
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            var checkCell = myCell + vec2i(dx, dy);
            checkCell = (checkCell + GRID_SIZE) % GRID_SIZE;
            
            let cellSeed = u32(checkCell.y * GRID_SIZE + checkCell.x);
            
            for (var s = 0; s < 12; s++) {
                let sampleSeed = cellSeed * 31u + u32(s) + u32(uniforms.time * 7.0);
                let sampleIdx = i32(hash_uint(sampleSeed) % u32(totalParticles));
                
                let sx = sampleIdx % stateSize.x;
                let sy = sampleIdx / stateSize.x;
                
                if (sx == coord.x && sy == coord.y) {
                    continue;
                }
                
                let otherState1 = textureLoad(stateTex1, vec2i(sx, sy), 0);
                let otherState2 = textureLoad(stateTex2, vec2i(sx, sy), 0);
                
                let otherPos = otherState1.xy;
                let otherType = i32(otherState2.x);
                
                if (otherPos.x == 0.0 && otherPos.y == 0.0) {
                    continue;
                }
                
                var diff = otherPos - pos;
                
                if (diff.x > uniforms.resolution.x * 0.5) { diff.x -= uniforms.resolution.x; }
                if (diff.x < -uniforms.resolution.x * 0.5) { diff.x += uniforms.resolution.x; }
                if (diff.y > uniforms.resolution.y * 0.5) { diff.y -= uniforms.resolution.y; }
                if (diff.y < -uniforms.resolution.y * 0.5) { diff.y += uniforms.resolution.y; }
                
                let dist = length(diff);
                
                if (dist < 0.001 || dist > uniforms.maxRadius) {
                    continue;
                }
                
                let forceParams = textureLoad(forceMatrix, vec2i(myType, otherType), 0);
                let strength = forceParams.x;
                let prefDist = forceParams.y;
                let curveShape = forceParams.z;
                
                let forceMag = radialForce(dist, strength, prefDist, curveShape,
                                           uniforms.minRadius, uniforms.maxRadius,
                                           uniforms.attractionScale, uniforms.repulsionScale);
                
                let forceDir = diff / dist;
                totalForce += forceDir * forceMag;
                neighborCount++;
            }
        }
    }
    
    totalForce /= myMass;
    
    return vec4f(totalForce, f32(neighborCount), 1.0);
}
