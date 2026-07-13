/*
 * Watercolor - simplify pass: 3x3 median network (Devillard opt_med9, the
 * same 19-op compare-exchange sequence as filter/median's medianPass.wgsl)
 * sampled at a pixel stride that widens as `detail` decreases. See
 * glsl/wcSimplify.glsl for the full description. Executed twice per frame
 * (fixed `repeat: 2` in definition.js), ping-ponging global_wc_state.
 */

struct Uniforms {
    detail: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn sort2(a: ptr<function, vec3<f32>>, b: ptr<function, vec3<f32>>) {
    let lo = min(*a, *b);
    let hi = max(*a, *b);
    *a = lo;
    *b = hi;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    // detail=0 -> stride 3px (coarse); detail=100 -> stride 1px (fine).
    let stride = mix(3.0, 1.0, clamp(uniforms.detail, 0.0, 100.0) / 100.0);
    let texel = stride / texSize;
    let uv = pos.xy / texSize;

    let s0 = textureSample(inputTex, inputSampler, uv + vec2<f32>(-texel.x, -texel.y));
    let s1 = textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0, -texel.y));
    let s2 = textureSample(inputTex, inputSampler, uv + vec2<f32>(texel.x, -texel.y));
    let s3 = textureSample(inputTex, inputSampler, uv + vec2<f32>(-texel.x, 0.0));
    let s4 = textureSample(inputTex, inputSampler, uv);
    let s5 = textureSample(inputTex, inputSampler, uv + vec2<f32>(texel.x, 0.0));
    let s6 = textureSample(inputTex, inputSampler, uv + vec2<f32>(-texel.x, texel.y));
    let s7 = textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0, texel.y));
    let s8 = textureSample(inputTex, inputSampler, uv + vec2<f32>(texel.x, texel.y));

    var p0 = s0.rgb; var p1 = s1.rgb; var p2 = s2.rgb;
    var p3 = s3.rgb; var p4 = s4.rgb; var p5 = s5.rgb;
    var p6 = s6.rgb; var p7 = s7.rgb; var p8 = s8.rgb;

    sort2(&p1, &p2); sort2(&p4, &p5); sort2(&p7, &p8);
    sort2(&p0, &p1); sort2(&p3, &p4); sort2(&p6, &p7);
    sort2(&p1, &p2); sort2(&p4, &p5); sort2(&p7, &p8);
    sort2(&p0, &p3); sort2(&p5, &p8); sort2(&p4, &p7);
    sort2(&p3, &p6); sort2(&p1, &p4); sort2(&p2, &p5);
    sort2(&p4, &p7); sort2(&p4, &p2); sort2(&p6, &p4);
    sort2(&p4, &p2);

    return vec4<f32>(p4, s4.a);
}
