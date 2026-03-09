/*
 * Pixel Sort - Prepare pass
 * Rotate input by angle, optionally invert for darkest-first mode
 */

const PI: f32 = 3.141592653589793;

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> angle: f32;
@group(0) @binding(2) var<uniform> darkest: i32;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let center = texSize * 0.5;
    let pixelCoord = pos.xy - center;

    let rad = angle * PI / 180.0;
    let c = cos(rad);
    let s = sin(rad);

    // Inverse rotation to find source coordinate
    let srcCoord = vec2<f32>(
        c * pixelCoord.x + s * pixelCoord.y,
        -s * pixelCoord.x + c * pixelCoord.y
    ) + center;

    var color: vec4<f32>;
    if (srcCoord.x < 0.0 || srcCoord.x >= texSize.x || srcCoord.y < 0.0 || srcCoord.y >= texSize.y) {
        color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    } else {
        color = textureLoad(inputTex, vec2<i32>(srcCoord), 0);
    }

    if (darkest != 0) {
        color = vec4<f32>(1.0 - color.r, 1.0 - color.g, 1.0 - color.b, color.a);
    }

    return color;
}
