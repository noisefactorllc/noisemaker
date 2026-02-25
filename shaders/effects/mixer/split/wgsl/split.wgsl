@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> position : f32;
@group(0) @binding(4) var<uniform> rotation : f32;
@group(0) @binding(5) var<uniform> softness : f32;
@group(0) @binding(6) var<uniform> invert : i32;

const PI: f32 = 3.14159265359;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = pos.xy / dims;

    let colorA = textureSample(inputTex, samp, st);
    let colorB = textureSample(tex, samp, st);

    let aspect = dims.x / dims.y;
    var centered = (st - vec2<f32>(0.5, 0.5)) * 2.0;
    centered.x = centered.x * aspect;

    // Rotate the split line
    let rad = rotation * PI / 180.0;
    let c = cos(rad);
    let s = sin(rad);
    let rotated = vec2<f32>(centered.x * c - centered.y * s,
                            centered.x * s + centered.y * c);

    // Signed distance from the split line
    let d = rotated.y - position;

    // Apply softness
    let halfSoft = max(softness * 0.5, 0.001);
    var mask = smoothstep(-halfSoft, halfSoft, d);

    if (invert == 1) {
        mask = 1.0 - mask;
    }

    var color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    return color;
}
