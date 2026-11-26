// Fill the frame with the background colour before the points are drawn.

@group(0) @binding(0) var<uniform> background: vec4<f32>;

@fragment
fn main() -> @location(0) vec4<f32> {
    return background;
}
