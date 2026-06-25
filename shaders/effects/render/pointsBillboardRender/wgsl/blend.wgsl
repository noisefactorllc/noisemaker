// Blend pass - combines input with accumulated trails

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var trailTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> resolution: vec2<f32>;
@group(0) @binding(4) var<uniform> inputIntensity: f32;
@group(0) @binding(5) var<uniform> blendMode: i32;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = max(resolution, vec2<f32>(1.0));
    var uv = position.xy / size;

    let inputColor = textureSample(inputTex, u_sampler, uv);
    let trailColor = textureSample(trailTex, u_sampler, uv);

    let t = inputIntensity / 100.0;
    let scaledInput = inputColor * t;

    var outRGB: vec3<f32>;
    var outAlpha: f32;

    if (blendMode == 1) {
        // Alpha mode: trail stores premultiplied values (rgb = actual_color * alpha).
        // Use premultiplied OVER operator then convert to straight for output.
        outAlpha = trailColor.a + scaledInput.a * (1.0 - trailColor.a);
        let outRGB_pre = trailColor.rgb + scaledInput.rgb * scaledInput.a * (1.0 - trailColor.a);
        outRGB = select(vec3<f32>(0.0), outRGB_pre / outAlpha, outAlpha > 0.0);
    } else {
        // Additive mode: clamp trail to [0,1] then screen-blend with input (avoids overflow).
        let trail = clamp(trailColor.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
        let trailPresence = max(max(trail.r, trail.g), trail.b);
        outRGB = trail + scaledInput.rgb * (1.0 - trail);
        outAlpha = max(trailPresence, scaledInput.a);
    }

    return clamp(vec4<f32>(outRGB, outAlpha), vec4<f32>(0.0), vec4<f32>(1.0));
}
