// Wormhole - luminance-driven displacement field
// Gather adaptation of Python scatter_nd wormhole

const TAU : f32 = 6.28318530717958647692;

@group(0) @binding(0) var u_sampler : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution : vec2<f32>;
@group(0) @binding(3) var<uniform> time : f32;
@group(0) @binding(4) var<uniform> kink : f32;
@group(0) @binding(5) var<uniform> stride : f32;
@group(0) @binding(6) var<uniform> alpha : f32;
@group(0) @binding(7) var<uniform> speed : f32;

fn luminance(color : vec4<f32>) -> f32 {
    return dot(color.xyz, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let uv = position.xy / resolution;

    // Get source pixel
    let src = textureSample(inputTex, u_sampler, uv);
    let lum = luminance(src);

    // Luminance to angle (Python: values * tau * kink)
    let angle = lum * TAU * kink;

    // Displacement in UV space (Python: (cos/sin + 1) * 1024 * input_stride)
    // Scale stride so default 1.0 produces strong displacement
    let s = stride * 0.25;
    let offsetX = (cos(angle) + 1.0) * s;
    let offsetY = (sin(angle) + 1.0) * s;

    // Sample from offset position (gather instead of scatter)
    let sampleCoord = fract(uv + vec2<f32>(offsetX, offsetY));
    let sampled = textureSample(inputTex, u_sampler, sampleCoord);

    // Weight by luminance squared (Python: square(values))
    let weight = lum * lum;
    let warped = sampled * weight;

    // Blend with original (Python: blend(tensor, sqrt(out), alpha))
    let result = mix(src, sqrt(warped), alpha);

    return result;
}
