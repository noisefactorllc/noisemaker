@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> mode : i32;
@group(0) @binding(4) var<uniform> mixAmt : f32;

fn map_range(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
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
        // mix (average)
        return (color1 + color2) * 0.5;
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

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = position.xy / dims;

    let color1 = textureSample(inputTex, samp, st);
    let color2 = textureSample(tex, samp, st);

    let amt = map_range(mixAmt, -100.0, 100.0, 0.0, 1.0);

    // The normal mixer axis is source opacity. Other modes reach the full
    // blend at the midpoint, then transition to normal source-over at +100.
    let opacity = select(min(amt * 2.0, 1.0), amt, mode == 8);
    let sourceAlpha = color2.a * opacity;
    var source = color2.rgb * opacity;
    if (mode != 8) {
        // Surfaces are premultiplied. Blend functions operate on straight RGB
        // only where both inputs cover the pixel; uncovered source stays intact.
        var baseColor = vec4<f32>(0.0, 0.0, 0.0, 1.0);
        var sourceColor = vec4<f32>(0.0, 0.0, 0.0, 1.0);
        if (color1.a > 0.0) { baseColor = vec4<f32>(color1.rgb / color1.a, 1.0); }
        if (color2.a > 0.0) { sourceColor = vec4<f32>(color2.rgb / color2.a, 1.0); }
        var blended = applyBlendMode(baseColor, sourceColor, mode).rgb;
        blended = mix(blended, sourceColor.rgb, max(amt * 2.0 - 1.0, 0.0));
        source = source * (1.0 - color1.a) + blended * sourceAlpha * color1.a;
    }

    return vec4<f32>(source + color1.rgb * (1.0 - sourceAlpha),
        sourceAlpha + color1.a * (1.0 - sourceAlpha));
}
