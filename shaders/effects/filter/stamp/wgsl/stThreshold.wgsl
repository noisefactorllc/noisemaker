/*
 * Stamp - threshold pass. See stThreshold.glsl for the full algorithm
 * derivation. This is a 1:1 port with NO manual Y compensation anywhere:
 * the fbm/hash noise is isotropic per-pixel value noise with nothing
 * fragment-coordinate-derived beyond the noise coordinate itself, so GLSL
 * and WGSL are textually identical.
 *
 * tileOffset converts tile-local positions into global procedural
 * coordinates, matching GLSL's `floor(gl_FragCoord.xy) + tileOffset`:
 * globalCoord seeds the fbm/hash grain noise (the grain lesson - oilPaint's
 * oilPost sponge-mode precedent) so the threshold contour's roughness grain
 * is continuous across CLI render tiles. It is zero for ordinary full-frame
 * renders (see filter/stipple's WGSL port for the same pattern).
 */

struct Uniforms {
    balance: f32,
    roughness: f32,
    inkColor: vec3<f32>,
    paperColor: vec3<f32>,
    tileOffset: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var blurTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2<f32>(1.0, 0.0)), u.x),
               mix(hash12(i + vec2<f32>(0.0, 1.0)), hash12(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

fn fbm(p_in: vec2<f32>) -> f32 {
    var p = p_in;
    var v = 0.0;
    var a = 0.5;
    for (var i: i32 = 0; i < 5; i++) {
        v += a * vnoise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

fn tonemap2(t: f32, ink: vec3<f32>, paper: vec3<f32>) -> vec3<f32> {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let blur = textureSample(blurTex, inputSampler, uv);

    // Tile-aware integer global pixel coordinate for the noise input, per
    // the grain lesson (oilPaint's oilPost sponge-mode precedent).
    let globalCoord = floor(pos.xy) + uniforms.tileOffset;

    let lumBlur = lum(blur.rgb);
    let grain = (fbm(globalCoord / 3.0) - 0.5) * (uniforms.roughness / 100.0) * 0.35;
    let t = lumBlur + grain;

    let b = uniforms.balance / 100.0;
    let aa = max(fwidth(t), 0.01) + (uniforms.roughness / 100.0) * 0.05;
    let m = smoothstep(b - aa, b + aa, t);

    let outColor = tonemap2(m, uniforms.inkColor, uniforms.paperColor);
    return vec4<f32>(outColor, src.a);
}
