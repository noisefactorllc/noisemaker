// Second reduction pass: reduce 32x32 tile to 1x1 global min/max
// Matches reduce2.glsl

@group(0) @binding(0) var reduceTex1: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    if (fragCoord.x >= 1.0 || fragCoord.y >= 1.0) {
        return vec4<f32>(0.0);
    }
    
    var min_val: f32 = 1e30;
    var max_val: f32 = -1e30;
    
    for (var y = 0; y < 32; y++) {
        for (var x = 0; x < 32; x++) {
            let val = textureLoad(reduceTex1, vec2<i32>(x, y), 0);
            min_val = min(min_val, val.r);
            max_val = max(max_val, val.g);
        }
    }
    
    if (min_val > max_val) {
        min_val = 0.0;
        max_val = 0.0;
    }
    
    return vec4<f32>(min_val, max_val, 0.0, 1.0);
}
