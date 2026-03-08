// Final stats pass: reduce all min/max values to a single global min/max
// Input: reduceTex with .r = local min, .g = local max
// Output: 1x1 texture with .r = global min, .g = global max

@group(0) @binding(0) var reduceTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let inSize: vec2<u32> = textureDimensions(reduceTex, 0);
    
    var globalMin: f32 = 100000.0;
    var globalMax: f32 = -100000.0;
    
    // Read all pixels from the reduced texture
    for (var y: u32 = 0u; y < inSize.y; y = y + 1u) {
        for (var x: u32 = 0u; x < inSize.x; x = x + 1u) {
            let stats: vec4<f32> = textureLoad(reduceTex, vec2<i32>(i32(x), i32(y)), 0);
            globalMin = min(globalMin, stats.r);
            globalMax = max(globalMax, stats.g);
        }
    }
    
    // Store global min/max
    return vec4<f32>(globalMin, globalMax, 0.0, 1.0);
}
