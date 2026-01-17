/*
 * Cel Shading - Edge Detection Pass
 * Sobel edge detection on quantized colors for outline generation
 */

struct Uniforms {
    edgeWidth: f32,
    edgeThreshold: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var colorTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

// Convert RGB to luminosity
fn getLuminosity(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

fn wrapCoord(value: i32, size: i32) -> i32 {
    if (size <= 0) {
        return 0;
    }
    var wrapped = value % size;
    if (wrapped < 0) {
        wrapped = wrapped + size;
    }
    return wrapped;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<i32>(textureDimensions(colorTex));
    if (texSize.x == 0 || texSize.y == 0) {
        return vec4f(0.0);
    }
    
    let coord = vec2<i32>(pos.xy);
    
    // Sample 3x3 neighborhood with thickness scaling
    let offset = i32(uniforms.edgeWidth);
    var samples: array<f32, 9>;
    var idx = 0;
    for (var ky = -1; ky <= 1; ky = ky + 1) {
        for (var kx = -1; kx <= 1; kx = kx + 1) {
            let sampleX = wrapCoord(coord.x + kx * offset, texSize.x);
            let sampleY = wrapCoord(coord.y + ky * offset, texSize.y);
            let texel = textureLoad(colorTex, vec2<i32>(sampleX, sampleY), 0);
            samples[idx] = getLuminosity(texel.rgb);
            idx = idx + 1;
        }
    }
    
    // Sobel X kernel: [-1 0 1; -2 0 2; -1 0 1]
    let gx = -samples[0] + samples[2] - 2.0*samples[3] + 2.0*samples[5] - samples[6] + samples[8];
    
    // Sobel Y kernel: [-1 -2 -1; 0 0 0; 1 2 1]
    let gy = -samples[0] - 2.0*samples[1] - samples[2] + samples[6] + 2.0*samples[7] + samples[8];
    
    // Calculate edge magnitude
    let magnitude = sqrt(gx * gx + gy * gy);
    
    // Apply threshold with smoothstep for anti-aliased edges
    let edge = smoothstep(uniforms.edgeThreshold * 0.5, uniforms.edgeThreshold * 1.5, magnitude);
    
    return vec4f(edge, edge, edge, 1.0);
}
