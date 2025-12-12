@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> mixAmt : f32;

fn map_range(value : f32, inMin : f32, inMax : f32, outMin : f32, outMax : f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn blendOverlay(a : f32, b : f32) -> f32 {
    if (a < 0.5) {
        return 2.0 * a * b;
    }
    return 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var st = position.xy / dims;
    

    let color1 = textureSample(inputTex, samp, st);
    let color2 = textureSample(tex, samp, st);

    // overlay blend
    let middle = vec4<f32>(
        blendOverlay(color1.r, color2.r),
        blendOverlay(color1.g, color2.g),
        blendOverlay(color1.b, color2.b),
        mix(color1.a, color2.a, 0.5)
    );

    let amt = map_range(mixAmt, -100.0, 100.0, 0.0, 1.0);
    var color : vec4<f32>;
    if (amt < 0.5) {
        color = mix(color1, middle, amt * 2.0);
    } else {
        color = mix(middle, color2, (amt - 0.5) * 2.0);
    }

    color.a = max(color1.a, color2.a);
    return color;
}
