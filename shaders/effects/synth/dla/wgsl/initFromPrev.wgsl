// DLA - Init From Prev Pass (decay grid)

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var gridTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> decay: f32;
@group(0) @binding(2) var<uniform> frame: i32;
@group(0) @binding(3) var<uniform> resetState: i32;

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, vec3<f32>(p3.z, p3.y, p3.x) + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    // If resetState is true, clear the trail
    if (resetState != 0) {
        return vec4<f32>(0.0);
    }
    
    let dims = vec2<f32>(textureDimensions(gridTex));
    let dimsI = vec2<i32>(textureDimensions(gridTex));
    let coord = vec2<i32>(in.position.xy);
    let uv = vec2<f32>(coord) / dims;
    
    // Direct sample - no blur
    let prev = textureLoad(gridTex, coord, 0).a;
    
    // Apply decay to simulation grid (chemistry)
    // decay=0 means full persistence, higher decay = faster fade
    let persistence = clamp(1.0 - decay, 0.0, 1.0);
    var energy = prev * persistence;
    
    // Cap energy to prevent runaway accumulation
    energy = min(energy, 6.0);

    // Seed logic for first frame only
    if (frame <= 1) {
        let rng = hash21(vec2<f32>(coord) + f32(frame) * 17.0);
        let radial = smoothstep(0.18, 0.02, length(uv - 0.5));
        let seedDensity = 0.005;
        let densityScale = clamp(seedDensity * 900.0, 0.0, 0.98);
        let seedWeight = step(1.0 - densityScale, rng) * radial;
        if (seedWeight > 0.0) {
            let strength = mix(0.25, 0.85, seedWeight);
            energy = max(energy, strength);
        }
    }
    
    return vec4<f32>(energy, energy, energy, energy);
}
