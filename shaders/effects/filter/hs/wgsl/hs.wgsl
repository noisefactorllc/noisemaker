/*
 * Hue and saturation adjustment effect
 */

struct Uniforms {
    data: array<vec4<f32>, 1>,
};

fn mapVal(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    let r = rgb.r; let g = rgb.g; let b = rgb.b;
    let maxC = max(r, max(g, b));
    let minC = min(r, min(g, b));
    let delta = maxC - minC;

    var h = 0.0;
    if (delta != 0.0) {
        if (maxC == r) {
            h = ((g - b) / delta) % 6.0 / 6.0;
        } else if (maxC == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    var s = 0.0;
    if (maxC != 0.0) { s = delta / maxC; }
    return vec3<f32>(h, s, maxC);
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    let c = v * s;
    let x = c * (1.0 - abs((h * 6.0) % 2.0 - 1.0));
    let m = v - c;
    var rgb: vec3<f32>;
    if (h < 1.0/6.0) { rgb = vec3<f32>(c, x, 0.0); }
    else if (h < 2.0/6.0) { rgb = vec3<f32>(x, c, 0.0); }
    else if (h < 3.0/6.0) { rgb = vec3<f32>(0.0, c, x); }
    else if (h < 4.0/6.0) { rgb = vec3<f32>(0.0, x, c); }
    else if (h < 5.0/6.0) { rgb = vec3<f32>(x, 0.0, c); }
    else { rgb = vec3<f32>(c, 0.0, x); }
    return rgb + m;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let rotation = uniforms.data[0].x;
    let hueRange = uniforms.data[0].y;
    let saturation = uniforms.data[0].z;
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    var color = textureSample(inputTex, inputSampler, uv);

    // Convert to HSV
    var hsv = rgb2hsv(color.rgb);

    // Apply hue rotation and range scaling
    hsv.x = fract(hsv.x * mapVal(hueRange, 0.0, 200.0, 0.0, 2.0) + (rotation / 360.0));

    // Apply saturation
    hsv.y = hsv.y * saturation;

    // Convert back to RGB
    color = vec4<f32>(hsv2rgb(hsv), color.a);

    return color;
}
