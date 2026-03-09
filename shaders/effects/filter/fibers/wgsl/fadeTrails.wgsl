@group(0) @binding(0) var trailTex: texture_2d<f32>;
@group(0) @binding(1) var trailSampler: sampler;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(trailTex));
    let uv = (fragCoord.xy - 0.5) / dims;
    var c = textureSampleLevel(trailTex, trailSampler, uv, 0.0);
    // Slow decay to let fibers accumulate
    c *= 0.97;
    return c;
}
