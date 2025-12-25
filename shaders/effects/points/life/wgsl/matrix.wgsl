// WGSL ForceMatrix Generator
// Encodes type-pair interaction parameters

struct Uniforms {
    resolution: vec2f,
    typeCount: i32,
    matrixSeed: f32,
    symmetricForces: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let coord = vec2i(position.xy);
    let typeA = coord.x;
    let typeB = coord.y;
    
    // Skip if outside active types
    if (typeA >= uniforms.typeCount || typeB >= uniforms.typeCount) {
        return vec4f(0.0);
    }
    
    // Generate deterministic random based on seed and type pair
    var seed = u32(uniforms.matrixSeed * 1000.0) + u32(typeA * 31 + typeB * 17);
    
    // For symmetric forces, use canonical ordering
    if (uniforms.symmetricForces != 0 && typeB < typeA) {
        seed = u32(uniforms.matrixSeed * 1000.0) + u32(typeB * 31 + typeA * 17);
    }
    
    // Same type always has mild repulsion
    var strength: f32;
    if (typeA == typeB) {
        strength = -0.3 - hash(seed) * 0.4;
    } else {
        strength = hash(seed) * 2.0 - 1.0;
    }
    
    // Preferred distance (normalized)
    let prefDist = 0.3 + hash(seed + 1u) * 0.5;
    
    // Curve shape
    let curveShape = hash(seed + 2u);
    
    return vec4f(strength, prefDist, curveShape, 1.0);
}
