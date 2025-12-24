struct Uniforms {
    time: f32,
    resolution: vec2<f32>,
    seed: f32,
    stateSize: i32,
    layoutMode: i32,
    colorMode: i32,
    attrition: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(3) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;
@group(0) @binding(7) var tex: texture_2d<f32>;

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

fn hash2(seed: u32) -> vec2<f32> {
    return vec2<f32>(hash(seed), hash(seed + 1u));
}

@fragment
fn main(@builtin(position) coord: vec4<f32>) -> Outputs {
    let stateCoord = vec2<i32>(coord.xy);
    let uv = coord.xy / f32(u.stateSize);
    
    // Agent seed for random generation - compute early for attrition check
    let agentSeed = u32(stateCoord.x + stateCoord.y * u.stateSize) + u32(u.seed);
    
    // Read previous state using textureLoad (works in non-uniform control flow)
    let pPos = textureLoad(xyzTex, stateCoord, 0);
    let pVel = textureLoad(velTex, stateCoord, 0);
    let pCol = textureLoad(rgbaTex, stateCoord, 0);
    
    var needsRespawn = (pPos.w < 0.5) || (u.time < 0.01 && pPos.w == 0.0);
    
    // Attrition: per-frame random respawn chance
    // Use continuous time mixed with agent seed to decorrelate respawns
    if (!needsRespawn && u.attrition > 0.0) {
        // Mix time continuously into hash to avoid burst patterns
        // bitcast gives us full precision of time value
        let timeBits = bitcast<u32>(u.time);
        var check_seed = agentSeed * 1664525u + timeBits;
        check_seed = hash_uint(check_seed); // Extra mixing
        let respawnRand = f32(check_seed) / 4294967295.0;
        let attritionRate = u.attrition * 0.01; // 0-10% per frame
        if (respawnRand < attritionRate) {
            needsRespawn = true;
        }
    }
    
    // Compute spawn values unconditionally (no branching in texture access)
    // Use integer-based hash for cross-platform determinism
    let rnd = hash2(agentSeed);
    
    // Compute position based on layout mode
    var newPos = vec3<f32>(0.0);
    if (u.layoutMode == 0) { // Random
        newPos = vec3<f32>(rnd, 0.0);
    } else if (u.layoutMode == 1) { // Grid
        newPos = vec3<f32>(uv, 0.0);
    } else if (u.layoutMode == 2) { // Center
        newPos = vec3<f32>(0.5 + (rnd - 0.5) * 0.1, 0.0);
    } else if (u.layoutMode == 3) { // Ring
        let angle = rnd.x * 6.28318;
        let radius = 0.3 + rnd.y * 0.1;
        newPos = vec3<f32>(0.5 + vec2<f32>(cos(angle), sin(angle)) * radius, 0.0);
    } else if (u.layoutMode == 4) { // Clusters
        // 5 random cluster centers based on seed
        let clusterSeed = u32(u.seed) * 12345u;
        let clusterId = floor(rnd.x * 5.0);
        let centerSeed = clusterSeed + u32(clusterId) * 31u;
        let center = vec2<f32>(hash(centerSeed), hash(centerSeed + 17u));
        // Agents spread around center with ~15% radius
        let r = hash(agentSeed + 2u) * 0.15;
        let a = hash(agentSeed + 3u) * 6.28318;
        newPos = vec3<f32>(center + vec2<f32>(cos(a), sin(a)) * r, 0.0);
        // Wrap to [0,1]
        newPos = vec3<f32>(fract(newPos.xy), 0.0);
    } else if (u.layoutMode == 5) { // Spiral
        // Archimedean spiral from center
        let t = rnd.x * 20.0;
        let r = t * 0.02;  // Spiral expands slowly
        let a = t * 6.28318;
        newPos = vec3<f32>(0.5 + vec2<f32>(cos(a), sin(a)) * r, 0.0);
        // Clamp to valid range
        newPos = vec3<f32>(clamp(newPos.xy, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0);
    }
    
    // Sample color from tex - use textureLoad to avoid uniform control flow issue
    let texDims = textureDimensions(tex);
    let texCoord = vec2<i32>(newPos.xy * vec2<f32>(texDims));
    let sampledCol = textureLoad(tex, texCoord, 0);
    // Use sampled color if texture has content (alpha > 0), otherwise white
    let newCol = select(vec4<f32>(1.0), sampledCol, sampledCol.a > 0.0);
    
    // Select between spawned values and previous state
    if (needsRespawn) {
        // Store per-agent randoms in vel for downstream effects:
        // vel.z = rotRand [0,1] for rotation variation (flow behavior)
        // vel.w = strideRand [-0.5,0.5] for stride variation
        let rotRand = hash(agentSeed + 100u);
        let strideRand = hash(agentSeed + 101u) - 0.5;
        return Outputs(
            vec4<f32>(newPos, 1.0),
            vec4<f32>(0.0, 0.0, rotRand, strideRand),
            newCol
        );
    } else {
        return Outputs(pPos, pVel, pCol);
    }
}
