struct Uniforms {
    shapeMode: i32,
    aperture: f32,
    viewMode: i32,
}
@group(0) @binding(0) var spriteTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: Uniforms;

// Bilinear spatial weights preserve RGBA mass and first moments.
@fragment
fn main(@builtin(position) coord: vec4f) -> @location(0) vec4f {
    if (u.shapeMode != 0 || u.aperture <= 0.0 || u.viewMode == 0) { return vec4f(0.0); }
    let dims = vec2i(textureDimensions(spriteTex, 0));
    let node = vec2i(coord.xy) / 32;
    let tile = vec2i(coord.xy) % 32;
    let start = max(tile * dims / 32, (node - vec2i(1)) * dims / 4 - vec2i(1));
    let end = min((tile + vec2i(1)) * dims / 32, (node + vec2i(1)) * dims / 4 + vec2i(1));
    var total = vec4f(0.0);
    for (var y = start.y; y < end.y; y++) {
        for (var x = start.x; x < end.x; x++) {
            let uv = (vec2f(f32(x), f32(y)) + 0.5) / vec2f(dims);
            let weight = max(vec2f(0.0), 1.0 - abs(uv * 4.0 - vec2f(node)));
            total += textureLoad(spriteTex, vec2i(x, y), 0) * (weight.x * weight.y);
        }
    }
    return total / f32(dims.x * dims.y);
}
