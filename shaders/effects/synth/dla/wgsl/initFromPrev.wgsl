// DLA - Init From Prev Pass (decay grid)
// Fragment shader matching GLSL initFromPrev.glsl

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var gridTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> padding: f32;
@group(0) @binding(2) var<uniform> seedDensity: f32;
@group(0) @binding(3) var<uniform> density: f32;
@group(0) @binding(4) var<uniform> frame: i32;
@group(0) @binding(5) var<uniform> alpha: f32;
@group(0) @binding(6) var<uniform> resetState: i32;

fn hash11(p_in: f32) -> f32 {
    var p = fract(p_in * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, vec3<f32>(p3.z, p3.y, p3.x) + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(gridTex));
    let coord = vec2<i32>(in.position.xy);
    let uv = (vec2<f32>(coord) + 0.5) / dims;
    
    let prev = textureLoad(gridTex, coord, 0);
    
    // Controlled decay to keep the structure alive
    let padBias = clamp(padding / 8.0, 0.0, 1.0);
    let decay = mix(0.90, 0.988, clamp(alpha + padBias * 0.35, 0.0, 1.0));
    var energy = prev.a * decay;
    
    let rng = hash21(vec2<f32>(coord) + f32(frame) * 17.0);
    let radial = smoothstep(0.18, 0.02, length(uv - 0.5));
    var seedWeight = 0.0;
    
    if (frame <= 1 || resetState != 0) {
        let densityScale = clamp(seedDensity * 900.0, 0.0, 0.98);
        seedWeight = step(1.0 - densityScale, rng) * radial;
    } else if (energy < 0.015) {
        let dripChance = clamp(seedDensity * (3.0 + density * 2.5), 0.0, 0.4);
        seedWeight = step(1.0 - dripChance, rng * 0.82) * radial * 0.6;
    }
    
    if (seedWeight > 0.0) {
        let strength = mix(0.25, 0.85, seedWeight);
        energy = max(energy, strength);
    }
    
    // Mono output: grayscale only
    return vec4<f32>(energy, energy, energy, clamp(energy, 0.0, 1.0));
}
