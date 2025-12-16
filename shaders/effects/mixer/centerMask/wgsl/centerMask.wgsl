@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> power : f32;
@group(0) @binding(4) var<uniform> metric : i32;

fn clamp01(x: f32) -> f32 {
    return clamp(x, 0.0, 1.0);
}

fn distance_metric(p: vec2<f32>, corner: vec2<f32>, m: i32) -> f32 {
    var mm = m % 3;
    if (mm < 0) {
        mm = mm + 3;
    }
    let ap = abs(p);

    // 0: euclidean, 1: manhattan, 2: chebyshev
    if (mm == 0) {
        let d = length(ap);
        let maxD = length(corner);
        return d / maxD;
    }

    if (mm == 1) {
        let d = ap.x + ap.y;
        let maxD = corner.x + corner.y;
        return d / maxD;
    }

    let d = max(ap.x, ap.y);
    let maxD = max(corner.x, corner.y);
    return d / maxD;
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = position.xy / dims;

    let edgeColor = textureSample(inputTex, samp, st);
    let centerColor = textureSample(tex, samp, st);

    let minRes = min(dims.x, dims.y);

    // Centered, aspect-correct position (matches the GLSL path)
    let p = (position.xy - 0.5 * dims) / (0.5 * minRes);
    let corner = dims / minRes;

    let dist01 = clamp01(distance_metric(p, corner, metric));
    // Remap power from -100..100 to 0.1..50
    let scaledPower = mix(0.1, 50.0, (power + 100.0) / 200.0);
    let mask = pow(dist01, scaledPower);

    var color = mix(centerColor, edgeColor, mask);
    color.a = max(edgeColor.a, centerColor.a);

    return color;
}
