/*
 * WGSL Navier-Stokes display pass.
 * Plain bilinear blit of the intermediate smoothed canvas. No smoothing math here.
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, _, _)
    // data[1] = (inputIntensity, _, _, _)
    // data[2] = (tileOffset.x, tileOffset.y, fullResolution.x, fullResolution.y)
    data : array<vec4<f32>, 3>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var fbTex : texture_2d<f32>;
@group(0) @binding(3) var inputTex : texture_2d<f32>;

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let inputIntensity = uniforms.data[1].x;
    let tileOffset = uniforms.data[2].xy;
    let fullResolution = uniforms.data[2].zw;
    let globalCoord = pos.xy + tileOffset;

    let texSize = vec2<i32>(textureDimensions(fbTex, 0));
    let texSizeF = vec2<f32>(texSize);
    let minIdx = vec2<i32>(0);
    let maxIdx = texSize - vec2<i32>(1);

    let texelPos = (globalCoord * texSizeF / fullResolution) - vec2<f32>(0.5);
    let baseI = vec2<i32>(floor(texelPos));
    let f = fract(texelPos);

    let v00 = textureLoad(fbTex, clamp(baseI,                           minIdx, maxIdx), 0).b;
    let v10 = textureLoad(fbTex, clamp(baseI + vec2<i32>(1, 0),         minIdx, maxIdx), 0).b;
    let v01 = textureLoad(fbTex, clamp(baseI + vec2<i32>(0, 1),         minIdx, maxIdx), 0).b;
    let v11 = textureLoad(fbTex, clamp(baseI + vec2<i32>(1, 1),         minIdx, maxIdx), 0).b;

    let v0 = mix(v00, v10, f.x);
    let v1 = mix(v01, v11, f.x);
    let state = mix(v0, v1, f.y);

    let intensity = clamp(state, 0.0, 1.0);
    var outCol = vec3<f32>(intensity);

    let blend = clamp(inputIntensity, 0.0, 100.0) * 0.01;
    if (blend > 0.0) {
        let inputUv = globalCoord / fullResolution;
        let inputColor = textureSampleLevel(inputTex, samp, inputUv, 0.0).rgb;
        outCol = mix(outCol, inputColor, vec3<f32>(blend));
    }

    return vec4<f32>(outCol, 1.0);
}
