/*
 * Polar and vortex coordinate transforms
 */

struct Uniforms {
    time: f32,
    polarMode: i32,
    speed: f32,
    rotation: f32,
    scale: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const TAU: f32 = 6.28318530718;

fn smod1(v: f32, m: f32) -> f32 {
    return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

fn polarCoords(uvIn: vec2<f32>) -> vec2<f32> {
    let uv = uvIn - 0.5;
    var coord = vec2<f32>(atan2(uv.y, uv.x) / TAU + 0.5, length(uv) - uniforms.scale * 0.075);
    coord.x = smod1(coord.x + uniforms.time * -uniforms.rotation, 1.0);
    coord.y = smod1(coord.y + uniforms.time * uniforms.speed, 1.0);
    return coord;
}

fn vortexCoords(uvIn: vec2<f32>) -> vec2<f32> {
    var uv = uvIn - 0.5;
    let r2 = dot(uv, uv) - uniforms.scale * 0.01;
    uv = uv / r2;
    uv.x = smod1(uv.x + uniforms.time * -uniforms.rotation, 1.0);
    uv.y = smod1(uv.y + uniforms.time * uniforms.speed, 1.0);
    return uv;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    var coord: vec2<f32>;
    if (uniforms.polarMode == 0) {
        coord = polarCoords(uv);
    } else {
        coord = vortexCoords(uv);
    }

    return textureSample(inputTex, inputSampler, coord);
}
