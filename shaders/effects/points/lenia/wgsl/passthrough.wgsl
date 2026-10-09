// Passthrough shader - copy input to output for 2D chain continuity

@group(0) @binding(0) var inputTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let coord = vec2<i32>(position.xy);
    return textureLoad(inputTex, coord, 0);
}
