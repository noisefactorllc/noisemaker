// Wormhole Deposit - Scatter pixels to destination based on OKLab L channel

struct Uniforms {
    resolution: vec2<f32>,
    kink: f32,
    stride: f32,
    rotation: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

const TAU: f32 = 6.28318530717959;

// OKLab L channel extraction (matches JS rgbToOklab -> L)
fn oklabL(rgb: vec3<f32>) -> f32 {
    let c = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    let m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    let s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
    let l_ = pow(max(l, 0.0), 1.0 / 3.0);
    let m_ = pow(max(m, 0.0), 1.0 / 3.0);
    let s_ = pow(max(s, 0.0), 1.0 / 3.0);
    return 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;

    let texSize = textureDimensions(inputTex, 0);
    let w = i32(texSize.x);
    let h = i32(texSize.y);

    if (i32(vertexIndex) >= w * h) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        return out;
    }

    let srcX = i32(vertexIndex) % w;
    let srcY = i32(vertexIndex) / w;

    let src = textureLoad(inputTex, vec2<i32>(srcX, srcY), 0);
    let lum = oklabL(src.rgb);

    let angle = lum * TAU * u.kink + radians(u.rotation);
    let pixelStride = 1024.0 * u.stride;

    let ox = (cos(angle) + 1.0) * pixelStride;
    let oy = (sin(angle) + 1.0) * pixelStride;

    var destX = i32(floor(f32(srcX) + ox)) % w;
    var destY = i32(floor(f32(srcY) + oy)) % h;
    if (destX < 0) { destX = destX + w; }
    if (destY < 0) { destY = destY + h; }

    let clipX = (f32(destX) + 0.5) / f32(w) * 2.0 - 1.0;
    // WebGPU Y is flipped vs WebGL2
    let clipY = 1.0 - (f32(destY) + 0.5) / f32(h) * 2.0;

    out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
    out.color = vec4<f32>(src.rgb * lum * lum, 0.0);
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
