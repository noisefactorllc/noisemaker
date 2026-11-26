// Each output pixel takes red from its cell in the first target and green
// from its cell in the second, as glsl/combine.glsl does.

@group(0) @binding(0) var columnCells: texture_2d<f32>;
@group(0) @binding(1) var rowCells: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let pixel = vec2<i32>(position.xy);
    let screen = vec2<i32>(resolution);
    let columnCell = pixel * vec2<i32>(textureDimensions(columnCells, 0)) / screen;
    let rowCell = pixel * vec2<i32>(textureDimensions(rowCells, 0)) / screen;
    let red = textureLoad(columnCells, columnCell, 0).r;
    let green = textureLoad(rowCells, rowCell, 0).g;
    return vec4<f32>(red, green, 1.0, 1.0);
}
