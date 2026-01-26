// Clear pass - fill with background color

struct Uniforms {
    bgColor: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(u.bgColor, 1.0);
}
