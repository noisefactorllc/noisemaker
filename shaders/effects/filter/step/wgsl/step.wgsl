/*
 * Step threshold effect
 * Creates hard edge at threshold value
 */

struct Uniforms {
    threshold: f32,
    antialias: i32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let threshold = uniforms.threshold;

    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    var color = textureSample(inputTex, inputSampler, uv);

    if (uniforms.antialias != 0) {
        let fw = fwidth(color.rgb);
        color = vec4<f32>(
            smoothstep(threshold - fw * 0.5, threshold + fw * 0.5, color.rgb),
            color.a
        );
    } else {
        color = vec4<f32>(step(vec3<f32>(threshold), color.rgb), color.a);
    }

    return color;
}
