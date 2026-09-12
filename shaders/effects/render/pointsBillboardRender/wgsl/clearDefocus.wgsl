@group(0) @binding(0) var<uniform> clearValue: f32;
@fragment
fn main() -> @location(0) vec4f {
    return vec4f(clearValue);
}
