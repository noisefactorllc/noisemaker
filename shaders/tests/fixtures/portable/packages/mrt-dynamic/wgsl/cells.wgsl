// Two render targets at one cell per texel, as glsl/cells.glsl writes them.

@group(0) @binding(0) var<uniform> zoom: i32;

struct FragmentOutput {
    @location(0) columns: vec4<f32>,
    @location(1) rows: vec4<f32>,
};

@fragment
fn main(@builtin(position) position: vec4<f32>) -> FragmentOutput {
    let cell = vec2<i32>(position.xy);
    var out: FragmentOutput;
    out.columns = vec4<f32>(f32(cell.x * zoom) / 255.0, 0.0, 0.0, 1.0);
    out.rows = vec4<f32>(0.0, f32(cell.y * zoom) / 255.0, 0.0, 1.0);
    return out;
}
