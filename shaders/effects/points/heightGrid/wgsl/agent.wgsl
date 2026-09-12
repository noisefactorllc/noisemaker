struct Uniforms {
    gridScale: f32,
    heightScale: f32,
    heightOffset: f32,
}
struct Outputs {
    @location(0) outXYZ: vec4f,
    @location(1) outVel: vec4f,
    @location(2) outRGBA: vec4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(2) var velTex: texture_2d<f32>;
@group(0) @binding(3) var heightTex: texture_2d<f32>;
@group(0) @binding(4) var heightSampler: sampler;
@group(0) @binding(5) var diffuseTex: texture_2d<f32>;
@group(0) @binding(6) var diffuseSampler: sampler;

// MRT state update, with the same slot identity as pointsEmit on each backend.
@fragment
fn main(@builtin(position) fragCoord: vec4f) -> Outputs {
    let coord = vec2i(fragCoord.xy);
    let stateSize = textureDimensions(xyzTex, 0);
    let uv = (vec2f(coord) + 0.5) / vec2f(stateSize);
    // Match the surface texel coordinates to the particle slot coordinates.
    let imageUV = uv;
    let heightColor = textureSampleLevel(heightTex, heightSampler, imageUV, 0.0).rgb;
    let elevation = dot(heightColor, vec3f(0.2126, 0.7152, 0.0722));
    return Outputs(
        vec4f((uv.x - 0.5) * u.gridScale,
            elevation * u.heightScale + u.heightOffset,
            (uv.y - 0.5) * u.gridScale, 1.0),
        vec4f(0.0, 0.0, 0.0, textureLoad(velTex, coord, 0).w),
        textureSampleLevel(diffuseTex, diffuseSampler, imageUV, 0.0)
    );
}
