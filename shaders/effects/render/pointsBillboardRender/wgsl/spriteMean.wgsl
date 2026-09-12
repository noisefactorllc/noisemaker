struct Uniforms {
    shapeMode: i32,
    aperture: f32,
    viewMode: i32,
}
@group(0) @binding(0) var tilesTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: Uniforms;

@fragment
fn main(@builtin(position) coord: vec4f) -> @location(0) vec4f {
    if (u.shapeMode != 0 || u.aperture <= 0.0 || u.viewMode == 0) { return vec4f(0.0); }
    let origin = vec2i(coord.xy) * 32;
    var total = vec4f(0.0);
    for (var y = 0; y < 32; y++) {
        for (var x = 0; x < 32; x++) {
            total += textureLoad(tilesTex, origin + vec2i(x, y), 0);
        }
    }
    return total;
}
