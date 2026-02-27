@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> power : f32;
@group(0) @binding(4) var<uniform> shape : i32;
@group(0) @binding(5) var<uniform> hardness : f32;
@group(0) @binding(6) var<uniform> blendMode : i32;

fn clamp01(x: f32) -> f32 {
    return clamp(x, 0.0, 1.0);
}

fn blendOverlay(a: f32, b: f32) -> f32 {
    if (a < 0.5) {
        return 2.0 * a * b;
    } else {
        return 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
    }
}

fn blendSoftLight(base: f32, blend: f32) -> f32 {
    if (blend < 0.5) {
        return 2.0 * base * blend + base * base * (1.0 - 2.0 * blend);
    } else {
        return sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend);
    }
}

fn applyBlendMode(color1: vec4<f32>, color2: vec4<f32>, m: i32) -> vec4<f32> {
    // 0: add, 1: burn, 2: darken, 3: diff, 4: dodge, 5: exclusion,
    // 6: hardLight, 7: lighten, 8: mix, 9: multiply, 10: negation,
    // 11: overlay, 12: phoenix, 13: screen, 14: softLight, 15: subtract

    if (m == 0) {
        // add
        return min(color1 + color2, vec4<f32>(1.0));
    }
    if (m == 1) {
        // burn
        return 1.0 - min((1.0 - color1) / max(color2, vec4<f32>(0.001)), vec4<f32>(1.0));
    }
    if (m == 2) {
        // darken
        return min(color1, color2);
    }
    if (m == 3) {
        // diff
        return abs(color1 - color2);
    }
    if (m == 4) {
        // dodge
        return min(color1 / max(1.0 - color2, vec4<f32>(0.001)), vec4<f32>(1.0));
    }
    if (m == 5) {
        // exclusion
        return color1 + color2 - 2.0 * color1 * color2;
    }
    if (m == 6) {
        // hardLight (overlay with swapped args)
        return vec4<f32>(
            blendOverlay(color2.r, color1.r),
            blendOverlay(color2.g, color1.g),
            blendOverlay(color2.b, color1.b),
            1.0
        );
    }
    if (m == 7) {
        // lighten
        return max(color1, color2);
    }
    if (m == 8) {
        // mix (passthrough color2)
        return color2;
    }
    if (m == 9) {
        // multiply
        return color1 * color2;
    }
    if (m == 10) {
        // negation
        return vec4<f32>(1.0) - abs(vec4<f32>(1.0) - color1 - color2);
    }
    if (m == 11) {
        // overlay
        return vec4<f32>(
            blendOverlay(color1.r, color2.r),
            blendOverlay(color1.g, color2.g),
            blendOverlay(color1.b, color2.b),
            1.0
        );
    }
    if (m == 12) {
        // phoenix
        return min(color1, color2) - max(color1, color2) + vec4<f32>(1.0);
    }
    if (m == 13) {
        // screen
        return vec4<f32>(1.0) - (vec4<f32>(1.0) - color1) * (vec4<f32>(1.0) - color2);
    }
    if (m == 14) {
        // softLight
        return vec4<f32>(
            blendSoftLight(color1.r, color2.r),
            blendSoftLight(color1.g, color2.g),
            blendSoftLight(color1.b, color2.b),
            1.0
        );
    }
    // 15: subtract
    return max(color1 - color2, vec4<f32>(0.0));
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

    let dist01 = clamp01(distance_metric(p, corner, shape));
    // Remap power from -100..100 to 0.1..25.05 (Old 0 maps to New 100)
    let scaledPower = mix(0.1, 25.05, (power + 100.0) / 200.0);
    var mask = pow(dist01, scaledPower);

    // Apply hardness
    let h = clamp(hardness / 100.0, 0.0, 0.995);
    let width = (1.0 - h) * 0.5;
    mask = smoothstep(0.5 - width, 0.5 + width, mask);

    // Edge fading:
    // power < -95: fade to edgeColor (mask=1)
    // power > 95: fade to centerColor (mask=0)
    let f_low = clamp((power + 100.0) / 5.0, 0.0, 1.0);
    let f_high = clamp((100.0 - power) / 5.0, 0.0, 1.0);

    mask = mix(1.0, mask, f_low);
    mask = mask * f_high;

    // Apply blend mode between center and edge colors
    let blended = applyBlendMode(centerColor, edgeColor, blendMode);
    var color = mix(centerColor, blended, mask);
    color.a = max(edgeColor.a, centerColor.a);

    return color;
}
