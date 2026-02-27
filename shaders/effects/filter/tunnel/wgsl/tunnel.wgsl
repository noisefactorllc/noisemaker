/*
 * Perspective tunnel effect
 * Based on Inigo Quilez's tunnel shader
 * MIT License
 */

struct Uniforms {
    time: f32,
    shape: i32,
    speed: f32,
    rotation: f32,
    scale: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
    aspectLens: i32
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn polygonShape(uv: vec2<f32>, sides: i32) -> f32 {
    let a = atan2(uv.x, uv.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(uv);
}

fn smod2(v: vec2<f32>, m: f32) -> vec2<f32> {
    return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    // Center the coordinates
    var centered = uv - 0.5;

    // Optional aspect ratio correction
    let aspectRatio = texSize.x / texSize.y;
    if (uniforms.aspectLens != 0) { 
        centered.x = centered.x * aspectRatio; 
    }
    
    let a = atan2(centered.y, centered.x);
    var r: f32;
    
    if (uniforms.shape == 0) {
        // Circle
        r = length(centered);
    } else if (uniforms.shape == 1) {
        // Triangle
        r = polygonShape(centered * 2.0, 3);
    } else if (uniforms.shape == 2) {
        // Square
        r = polygonShape(centered * 2.0, 4);
    } else if (uniforms.shape == 3) {
        // Hexagon
        r = polygonShape(centered * 2.0, 6);
    } else {
        // Octagon
        r = polygonShape(centered * 2.0, 8);
    }
    
    // Apply scale
    r -= uniforms.scale * 0.15;
    
    // Create tunnel coordinates
    let tunnelCoords = smod2(vec2<f32>(
        0.3 / r + uniforms.time * uniforms.speed,
        a / PI + uniforms.time * uniforms.rotation
    ), 1.0);

    return textureSample(inputTex, inputSampler, tunnelCoords);
}
