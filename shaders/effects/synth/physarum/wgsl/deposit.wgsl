/*
 * Physarum deposit shader (WGSL port).
 * Vertex shader reads agent positions from state texture using textureLoad.
 * Fragment shader writes deposit amount to trail texture.
 * Uses textureLoad for exact texel sampling (no interpolation for state data).
 */

@group(0) @binding(0) var stateTex: texture_2d<f32>;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var inputSampler: sampler;
@group(0) @binding(3) var<uniform> u: Uniforms;

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    depositAmount: f32,
    weight: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) vUV: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexID: u32) -> VertexOutput {
    let size = vec2<i32>(textureDimensions(stateTex, 0));
    let w = size.x;
    let h = size.y;
    let x = i32(vertexID) % w;
    let y = i32(vertexID) / w;

    // Use textureLoad for exact texel (no interpolation for agent state)
    let agent = textureLoad(stateTex, vec2<i32>(x, y), 0);
    let clip = agent.xy / u.resolution * 2.0 - 1.0;
    
    var out: VertexOutput;
    out.position = vec4f(clip, 0.0, 1.0);
    out.vUV = agent.xy / u.resolution;
    return out;
}

fn luminance(color: vec3f) -> f32 {
    return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

fn sampleInputColor(uv: vec2f) -> vec3f {
    let flippedUV = vec2f(uv.x, 1.0 - uv.y);
    return textureSample(inputTex, inputSampler, flippedUV).rgb;
}

fn sampleInputLuminance(uv: vec2f) -> f32 {
    return luminance(sampleInputColor(uv));
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
    let blend = clamp(u.weight * 0.01, 0.0, 1.0);
    var deposit = u.depositAmount;
    if (blend > 0.0) {
        let inputValue = sampleInputLuminance(in.vUV);
        let gain = mix(1.0, mix(0.25, 2.0, inputValue), blend);
        deposit *= gain;
    }
    return vec4f(deposit, 0.0, 0.0, 1.0);
}
