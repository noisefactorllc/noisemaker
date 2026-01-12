/*
 * Distortion mixer shader (WGSL)
 * Applies displacement, reflection, and refraction effects between two surfaces
 * Uses Sobel convolution to calculate surface normals from luminosity
 */

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> mode: i32;
@group(0) @binding(4) var<uniform> mapSource: i32;
@group(0) @binding(5) var<uniform> intensity: f32;
@group(0) @binding(6) var<uniform> wrap: i32;
@group(0) @binding(7) var<uniform> smoothing: f32;
@group(0) @binding(8) var<uniform> aberration: f32;

// Convert RGB to luminosity
fn getLuminosity(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

// Calculate surface normal from height map using Sobel convolution
fn calculateNormal(uv: vec2f, texelSize: vec2f, useInputTex: bool) -> vec3f {
    // Apply smoothing to texel size for smoother normals
    let sampleSize = texelSize * smoothing;
    
    // Sobel X kernel
    var sobel_x = array<f32, 9>(
        -1.0, 0.0, 1.0,
        -2.0, 0.0, 2.0,
        -1.0, 0.0, 1.0
    );
    
    // Sobel Y kernel
    var sobel_y = array<f32, 9>(
        -1.0, -2.0, -1.0,
         0.0,  0.0,  0.0,
         1.0,  2.0,  1.0
    );
    
    var offsets = array<vec2f, 9>(
        vec2f(-sampleSize.x, -sampleSize.y),
        vec2f(0.0, -sampleSize.y),
        vec2f(sampleSize.x, -sampleSize.y),
        vec2f(-sampleSize.x, 0.0),
        vec2f(0.0, 0.0),
        vec2f(sampleSize.x, 0.0),
        vec2f(-sampleSize.x, sampleSize.y),
        vec2f(0.0, sampleSize.y),
        vec2f(sampleSize.x, sampleSize.y)
    );
    
    var dx: f32 = 0.0;
    var dy: f32 = 0.0;
    
    for (var i: i32 = 0; i < 9; i = i + 1) {
        var texSample: vec3f;
        if (useInputTex) {
            texSample = textureSample(inputTex, samp, uv + offsets[i]).rgb;
        } else {
            texSample = textureSample(tex, samp, uv + offsets[i]).rgb;
        }
        let height = getLuminosity(texSample);
        dx += height * sobel_x[i];
        dy += height * sobel_y[i];
    }
    
    // Scale gradients by intensity
    let normalStrength = intensity * 0.1;
    dx *= normalStrength;
    dy *= normalStrength;
    
    // Construct normal from gradients
    let normal = normalize(vec3f(-dx, -dy, 1.0));
    
    return normal;
}

// Apply wrap mode to coordinates
fn wrapCoords(st_in: vec2f) -> vec2f {
    var st = st_in;
    if (wrap == 0) {
        // mirror
        st = abs(st % vec2f(2.0) - vec2f(1.0));
        st = vec2f(1.0) - st;
    } else if (wrap == 1) {
        // repeat
        st = fract(st);
    } else if (wrap == 2) {
        // clamp
        st = clamp(st, vec2f(0.0), vec2f(1.0));
    }
    return st;
}

// Displacement effect based on color luminosity
fn applyDisplacement(uv: vec2f, useInputTexAsMap: bool) -> vec4f {
    var mapColor: vec4f;
    if (useInputTexAsMap) {
        mapColor = textureSample(inputTex, samp, uv);
    } else {
        mapColor = textureSample(tex, samp, uv);
    }
    
    let len = length(mapColor.rgb);
    
    var offset: vec2f;
    offset.x = cos(len * TAU) * (intensity * 0.001);
    offset.y = sin(len * TAU) * (intensity * 0.001);
    
    let displacedUV = wrapCoords(uv + offset);
    
    if (useInputTexAsMap) {
        return textureSample(tex, samp, displacedUV);
    } else {
        return textureSample(inputTex, samp, displacedUV);
    }
}

// Refraction effect based on surface normal
fn applyRefraction(uv: vec2f, texelSize: vec2f, useInputTexAsMap: bool) -> vec4f {
    let normal = calculateNormal(uv, texelSize, useInputTexAsMap);
    let refractionOffset = normal.xy * (intensity * 0.0125);
    let refractedUV = wrapCoords(uv + refractionOffset);
    
    if (useInputTexAsMap) {
        return textureSample(tex, samp, refractedUV);
    } else {
        return textureSample(inputTex, samp, refractedUV);
    }
}

// Reflection effect with chromatic aberration
fn applyReflection(uv: vec2f, texelSize: vec2f, useInputTexAsMap: bool) -> vec4f {
    let normal = calculateNormal(uv, texelSize, useInputTexAsMap);
    
    // Calculate incident vector for reflection, from center of image
    let incident = vec3f(normalize(uv - vec2f(0.5)), 100.0);
    
    // Calculate reflection vector
    let reflectionVec = reflect(incident, normal);
    
    // Convert to 2D texture offset
    let reflectionOffset = reflectionVec.xy * (intensity * 0.00005);
    
    // Apply chromatic aberration
    let redOffset = reflectionOffset * (1.0 + aberration * 0.0075);
    let greenOffset = reflectionOffset;
    let blueOffset = reflectionOffset * (1.0 - aberration * 0.0075);
    
    var redChannel: f32;
    var greenChannel: f32;
    var blueChannel: f32;
    var alphaChannel: f32;
    
    if (useInputTexAsMap) {
        redChannel = textureSample(tex, samp, wrapCoords(uv + redOffset)).r;
        greenChannel = textureSample(tex, samp, wrapCoords(uv + greenOffset)).g;
        blueChannel = textureSample(tex, samp, wrapCoords(uv + blueOffset)).b;
        alphaChannel = textureSample(tex, samp, wrapCoords(uv + reflectionOffset)).a;
    } else {
        redChannel = textureSample(inputTex, samp, wrapCoords(uv + redOffset)).r;
        greenChannel = textureSample(inputTex, samp, wrapCoords(uv + greenOffset)).g;
        blueChannel = textureSample(inputTex, samp, wrapCoords(uv + blueOffset)).b;
        alphaChannel = textureSample(inputTex, samp, wrapCoords(uv + reflectionOffset)).a;
    }
    
    return vec4f(redChannel, greenChannel, blueChannel, alphaChannel);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2f(textureDimensions(inputTex, 0));
    let uv = position.xy / dims;
    let texelSize = 1.0 / dims;
    
    var color: vec4f;
    
    // Determine which texture is the map source and which is the target
    // mapSource: 0 = inputTex (A), 1 = tex (B)
    // When A is map, we sample from B with A's normals
    // When B is map, we sample from A with B's normals
    let useInputTexAsMap = mapSource == 0;
    
    if (mode == 0) {
        // Displacement
        color = applyDisplacement(uv, useInputTexAsMap);
    } else if (mode == 1) {
        // Refraction
        color = applyRefraction(uv, texelSize, useInputTexAsMap);
    } else if (mode == 2) {
        // Reflection
        color = applyReflection(uv, texelSize, useInputTexAsMap);
    }
    
    return color;
}
