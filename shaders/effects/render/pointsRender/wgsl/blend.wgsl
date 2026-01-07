// Blend pass - combines input with accumulated trails

@group(0) @binding(0) var u_sampler : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var trailTex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> resolution : vec2<f32>;
@group(0) @binding(4) var<uniform> inputIntensity : f32;
@group(0) @binding(5) var<uniform> matteOpacity : f32;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let size = max(resolution, vec2<f32>(1.0));
    var uv = position.xy / size;
    let flippedUV = vec2<f32>(uv.x, 1.0 - uv.y);
    
    let inputColor = textureSample(inputTex, u_sampler, flippedUV);
    let trailColor = textureSample(trailTex, u_sampler, uv);
    
    // Additive blend: trail + scaled input
    // inputIntensity 0 = black, 100 = trail + full input
    let t = inputIntensity / 100.0;
    let matteAlpha = matteOpacity;
    
    // Trail presence based on max RGB channel
    let trailPresence = max(max(trailColor.r, trailColor.g), trailColor.b);
    
    // Background contribution is scaled by matte opacity (premultiplied)
    // Trail contribution is NOT affected by matte opacity
    let rgb = trailColor.rgb + inputColor.rgb * t * matteAlpha;
    
    // Alpha: where trail exists, full opacity; elsewhere, matte opacity
    let alpha = max(trailPresence, matteAlpha);
    
    return vec4<f32>(rgb, alpha);
}
