// Blend pass - combines input with accumulated trails

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var trailTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> resolution: vec2<f32>;
@group(0) @binding(4) var<uniform> inputIntensity: f32;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let size = max(resolution, vec2<f32>(1.0));
    var uv = position.xy / size;
    let flippedUV = vec2<f32>(uv.x, 1.0 - uv.y);
    
    let inputColor = textureSample(inputTex, u_sampler, flippedUV);
    let trailColor = textureSample(trailTex, u_sampler, uv);
    
    // Blend: trail over scaled input using alpha
    // inputIntensity 0 = trail only, 100 = trail over full input
    let t = inputIntensity / 100.0;
    let scaledInput = inputColor * t;
    
    // Alpha compositing: trail over input
    let outAlpha = trailColor.a + scaledInput.a * (1.0 - trailColor.a);
    var outRGB: vec3<f32>;
    if (outAlpha > 0.0) {
        outRGB = (trailColor.rgb * trailColor.a + scaledInput.rgb * scaledInput.a * (1.0 - trailColor.a)) / outAlpha;
    } else {
        outRGB = vec3<f32>(0.0);
    }
    
    return vec4<f32>(outRGB, outAlpha);
}
