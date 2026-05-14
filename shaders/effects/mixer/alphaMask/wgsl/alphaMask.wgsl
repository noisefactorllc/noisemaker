@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> mixAmt : f32;
@group(0) @binding(4) var<uniform> maskMode : i32;

fn map_range(value : f32, inMin : f32, inMax : f32, outMin : f32, outMax : f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var st = position.xy / dims;

    let color1 = textureSample(inputTex, samp, st);
    let color2 = textureSample(tex, samp, st);

    // luminance mask mode
    if (maskMode != 0) {
        let maskVal = dot(color2.rgb, vec3<f32>(0.299, 0.587, 0.114));
        return vec4<f32>(color1.rgb, color1.a * maskVal);
    }

    // alpha blend. slider direction selects which input is on top, so either slot
    // can serve as the alpha source — slide negative for A-on-top, positive for
    // B-on-top. each half reaches a full Porter-Duff source-over at the midpoint.
    var color : vec4<f32>;
    if (mixAmt < 0.0) {
        let AoverB = color2 * (1.0 - color1.a) + color1 * color1.a;
        color = mix(color1, AoverB, map_range(mixAmt, -100.0, 0.0, 0.0, 1.0));
    } else {
        let BoverA = color1 * (1.0 - color2.a) + color2 * color2.a;
        color = mix(BoverA, color2, map_range(mixAmt, 0.0, 100.0, 0.0, 1.0));
    }

    color.a = max(color1.a, color2.a);
    return color;
}
