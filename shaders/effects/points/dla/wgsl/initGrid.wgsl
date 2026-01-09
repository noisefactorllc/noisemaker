// DLA - Initialize and decay anchor grid

struct Uniforms {
    resolution: vec2<f32>,
    decay: f32,
    anchorDensity: f32,
    resetState: i32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var gridTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: Uniforms;

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, vec3<f32>(p3.z, p3.y, p3.x) + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    // If resetState is true, clear the grid
    if (u.resetState != 0) {
        return vec4<f32>(0.0);
    }
    
    let coord = vec2<i32>(in.position.xy);
    let uv = in.position.xy / u.resolution;
    
    // Sample previous grid value
    let prevSample = textureLoad(gridTex, coord, 0);
    let prev = prevSample.a;
    let prevColor = prevSample.rgb;
    
    // Apply decay (0 = full persistence, higher = faster fade)
    // decay range [0, 0.5] maps to persistence [1.0, 0.5]
    let persistence = 1.0 - u.decay;
    var energy = prev * persistence;
    var color = prevColor * persistence;
    
    // Cap energy to prevent runaway accumulation
    energy = min(energy, 3.0);
    
    // Seed initial structure - always try, but only where grid is empty
    let rng = hash21(in.position.xy);
    
    // Radial falloff from center - larger area for seeding
    let radial = smoothstep(0.25, 0.0, length(uv - 0.5));
    
    // Seed density controls threshold (higher = more seeds)
    // anchorDensity=1.0 → threshold=0.9 → 10% of radial pixels
    let seedThreshold = 1.0 - u.anchorDensity * 0.1;
    let seedWeight = step(seedThreshold, rng) * radial;
    
    // Only seed where there's no existing structure
    if (seedWeight > 0.0 && prev < 0.1) {
        let strength = mix(0.5, 1.0, rng);
        energy = max(energy, strength);
        color = vec3<f32>(strength);
    }
    
    return vec4<f32>(color, energy);
}
