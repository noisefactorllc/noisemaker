/*
 * Edge detection with multiple kernels, sizes, and blend modes
 */

struct Uniforms {
    kernel: f32,
    size: f32,
    blend: f32,
    invert: f32,
    channel: f32,
    threshold: f32,
    amount: f32,
    mixAmt: f32,
    level: f32,
    contourSide: f32,
    renderScale: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: Uniforms;

const LUMA = vec3<f32>(0.2126, 0.7152, 0.0722);

fn getWeight(dx: i32, dy: i32, kernelType: i32) -> f32 {
    if (dx == 0 && dy == 0) { return 0.0; }

    if (kernelType == 0) {
        // fine: cardinal neighbors only (cross Laplacian)
        if (dx == 0 || dy == 0) { return -1.0; }
        return 0.0;
    } else {
        // bold: all neighbors equally
        return -1.0;
    }
}

fn applyBlend(edge: vec4<f32>, orig: vec4<f32>, mode: i32) -> vec4<f32> {
    if (mode == 0) { return min(orig + edge, vec4<f32>(1.0)); }                        // add
    if (mode == 1) { return min(orig, edge); }                                          // darken
    if (mode == 2) { return abs(orig - edge); }                                         // difference
    if (mode == 3) { return min(orig / max(1.0 - edge, vec4<f32>(0.001)), vec4<f32>(1.0)); } // dodge
    if (mode == 4) { return max(orig, edge); }                                          // lighten
    if (mode == 5) { return orig * edge; }                                              // multiply
    if (mode == 7) {                                                                     // overlay
        let r = select(1.0 - 2.0 * (1.0 - orig.r) * (1.0 - edge.r), 2.0 * orig.r * edge.r, orig.r < 0.5);
        let g = select(1.0 - 2.0 * (1.0 - orig.g) * (1.0 - edge.g), 2.0 * orig.g * edge.g, orig.g < 0.5);
        let b = select(1.0 - 2.0 * (1.0 - orig.b) * (1.0 - edge.b), 2.0 * orig.b * edge.b, orig.b < 0.5);
        return vec4<f32>(r, g, b, orig.a);
    }
    if (mode == 8) { return 1.0 - (1.0 - orig) * (1.0 - edge); }                      // screen
    return edge;                                                                         // normal (6)
}

// Contour: mark only the selected side of a level crossing against the 4
// cardinal neighbors (Trace Contour). Returns a binary vec3:
// 1.0 = background (white), 0.0 = contour line (dark).
fn contourConv(uv: vec2<f32>, texelSize: vec2<f32>, centerRGB: vec3<f32>, lvl: f32, useLuma: bool, upperSide: bool) -> vec3<f32> {
    let northRGB = textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0,  1.0) * texelSize).rgb;
    let southRGB = textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0, -1.0) * texelSize).rgb;
    let eastRGB  = textureSample(inputTex, inputSampler, uv + vec2<f32>( 1.0, 0.0) * texelSize).rgb;
    let westRGB  = textureSample(inputTex, inputSampler, uv + vec2<f32>(-1.0, 0.0) * texelSize).rgb;

    if (useLuma) {
        let centerL = dot(centerRGB, LUMA);
        var centerOnSide = centerL < lvl;
        if (upperSide) {
            centerOnSide = centerL >= lvl;
        }
        let crossing = centerOnSide && select(
            dot(northRGB, LUMA) >= lvl || dot(southRGB, LUMA) >= lvl ||
            dot(eastRGB, LUMA) >= lvl  || dot(westRGB, LUMA) >= lvl,
            dot(northRGB, LUMA) < lvl || dot(southRGB, LUMA) < lvl ||
            dot(eastRGB, LUMA) < lvl  || dot(westRGB, LUMA) < lvl,
            upperSide
        );
        return vec3<f32>(select(1.0, 0.0, crossing));
    }

    var centerOnSide = centerRGB < vec3<f32>(lvl);
    if (upperSide) {
        centerOnSide = centerRGB >= vec3<f32>(lvl);
    }

    let crossR = centerOnSide.r && select(
        northRGB.r >= lvl || southRGB.r >= lvl || eastRGB.r >= lvl || westRGB.r >= lvl,
        northRGB.r < lvl || southRGB.r < lvl || eastRGB.r < lvl || westRGB.r < lvl,
        upperSide);
    let crossG = centerOnSide.g && select(
        northRGB.g >= lvl || southRGB.g >= lvl || eastRGB.g >= lvl || westRGB.g >= lvl,
        northRGB.g < lvl || southRGB.g < lvl || eastRGB.g < lvl || westRGB.g < lvl,
        upperSide);
    let crossB = centerOnSide.b && select(
        northRGB.b >= lvl || southRGB.b >= lvl || eastRGB.b >= lvl || westRGB.b >= lvl,
        northRGB.b < lvl || southRGB.b < lvl || eastRGB.b < lvl || westRGB.b < lvl,
        upperSide);

    return vec3<f32>(
        select(1.0, 0.0, crossR),
        select(1.0, 0.0, crossG),
        select(1.0, 0.0, crossB)
    );
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texelSize = 1.0 / texSize;

    let origColor = textureSample(inputTex, inputSampler, uv);

    let kernelType = i32(u.kernel);
    // Match edge.glsl: scale the kernel radius by renderScale so edge width
    // stays consistent under tiled / large-format (non-unit-scale) export.
    let radius = min(i32((u.size + 1.0) * u.renderScale), 256);
    let blendMode = i32(u.blend);
    let doInvert = u.invert > 0.5;
    let useLuma = u.channel > 0.5;

    // Convolution
    var conv = vec3<f32>(0.0);
    var centerWeight: f32 = 0.0;

    if (kernelType == 2) {
        // Contour: level-crossing trace, not a weighted convolution.
        conv = contourConv(uv, texelSize, origColor.rgb, u.level / 100.0, useLuma, u.contourSide > 0.5);
    } else {
        for (var dy = -3; dy <= 3; dy = dy + 1) {
            for (var dx = -3; dx <= 3; dx = dx + 1) {
                if (abs(dx) > radius || abs(dy) > radius) { continue; }
                if (dx == 0 && dy == 0) { continue; }

                let w = getWeight(dx, dy, kernelType);
                if (w == 0.0) { continue; }

                let offset = vec2<f32>(f32(dx), f32(dy)) * texelSize;
                let s = textureSample(inputTex, inputSampler, uv + offset).rgb;

                if (useLuma) {
                    conv = conv + vec3<f32>(dot(s, LUMA)) * w;
                } else {
                    conv = conv + s * w;
                }

                centerWeight = centerWeight - w;
            }
        }

        // Center sample
        var centerSample = origColor.rgb;
        if (useLuma) {
            centerSample = vec3<f32>(dot(centerSample, LUMA));
        }
        conv = conv + centerSample * centerWeight;
    }

    // Amount
    conv = conv * (u.amount / 50.0);
    conv = clamp(conv, vec3<f32>(0.0), vec3<f32>(1.0));

    // Threshold (before invert so it measures actual edge strength)
    if (u.threshold > 0.0) {
        let thresh = u.threshold / 100.0;
        var edge: f32;
        if (useLuma) {
            edge = conv.r;
        } else {
            edge = dot(conv, LUMA);
        }
        let mask = smoothstep(thresh - 0.01, thresh + 0.01, edge);
        conv = conv * mask;
    }

    // Invert
    if (doInvert) {
        conv = 1.0 - conv;
    }

    // Blend
    let edgeColor = vec4<f32>(conv, origColor.a);
    let blended = applyBlend(edgeColor, origColor, blendMode);

    // Mix
    let m = u.mixAmt / 100.0;
    return vec4<f32>(mix(origColor.rgb, blended.rgb, m), origColor.a);
}
