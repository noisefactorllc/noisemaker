/*
 * Flip/Mirror effect
 * Apply horizontal/vertical flipping and various mirroring modes
 */

struct Uniforms {
    flipMode: i32,
    _pad1: i32,
    _pad2: i32,
    _pad3: i32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var uv = pos.xy / texSize;

    if (uniforms.flipMode == 1) {
        // flip both
        uv.x = 1.0 - uv.x;
        uv.y = 1.0 - uv.y;
    } else if (uniforms.flipMode == 2) {
        // flip horizontal
        uv.x = 1.0 - uv.x;
    } else if (uniforms.flipMode == 3) {
        // flip vertical
        uv.y = 1.0 - uv.y;
    } else if (uniforms.flipMode == 11) {
        // mirror left to right
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
    } else if (uniforms.flipMode == 12) {
        // mirror right to left
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
    } else if (uniforms.flipMode == 13) {
        // mirror up to down
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (uniforms.flipMode == 14) {
        // mirror down to up
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (uniforms.flipMode == 15) {
        // mirror left to right, up to down
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (uniforms.flipMode == 16) {
        // mirror left to right, down to up
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (uniforms.flipMode == 17) {
        // mirror right to left, up to down
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (uniforms.flipMode == 18) {
        // mirror right to left, down to up
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    }

    return textureSample(inputTex, inputSampler, uv);
}
