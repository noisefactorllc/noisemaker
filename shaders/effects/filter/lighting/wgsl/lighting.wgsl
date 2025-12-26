/*
 * 3D lighting effect for 2D textures
 * Calculates surface normals from luminosity using Sobel convolution
 * and applies diffuse, specular, and ambient lighting
 */

struct Uniforms {
    diffuseColor: vec3f,
    _pad1: f32,
    specularColor: vec3f,
    specularIntensity: f32,
    ambientColor: vec3f,
    _pad2: f32,
    lightDirection: vec3f,
    normalStrength: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Convert RGB to luminosity
fn getLuminosity(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

// Calculate surface normal from height map using Sobel convolution
fn calculateNormal(uv: vec2f, texelSize: vec2f) -> vec3f {
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
        vec2f(-texelSize.x, -texelSize.y),
        vec2f(0.0, -texelSize.y),
        vec2f(texelSize.x, -texelSize.y),
        vec2f(-texelSize.x, 0.0),
        vec2f(0.0, 0.0),
        vec2f(texelSize.x, 0.0),
        vec2f(-texelSize.x, texelSize.y),
        vec2f(0.0, texelSize.y),
        vec2f(texelSize.x, texelSize.y)
    );
    
    var dx: f32 = 0.0;
    var dy: f32 = 0.0;
    
    for (var i: i32 = 0; i < 9; i = i + 1) {
        let sample = textureSample(inputTex, inputSampler, uv + offsets[i]);
        let height = getLuminosity(sample.rgb);
        dx += height * sobel_x[i];
        dy += height * sobel_y[i];
    }
    
    // Scale gradients by normal strength
    dx *= uniforms.normalStrength;
    dy *= uniforms.normalStrength;
    
    // Construct normal from gradients
    let normal = normalize(vec3f(-dx, -dy, 1.0));
    
    return normal;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texelSize = 1.0 / texSize;
    
    // Get original color
    let origColor = textureSample(inputTex, inputSampler, uv);
    
    // Calculate surface normal
    let normal = calculateNormal(uv, texelSize);
    
    // Normalize light direction
    let lightDir = normalize(uniforms.lightDirection);
    
    // Calculate view direction (straight at camera)
    let viewDir = vec3f(0.0, 0.0, 1.0);
    
    // Ambient lighting
    let ambient = uniforms.ambientColor * origColor.rgb;
    
    // Diffuse lighting (Lambertian)
    let diffuseFactor = max(dot(normal, lightDir), 0.0);
    let diffuse = uniforms.diffuseColor * diffuseFactor * origColor.rgb;
    
    // Specular lighting (Blinn-Phong)
    let halfDir = normalize(lightDir + viewDir);
    let specularFactor = pow(max(dot(normal, halfDir), 0.0), 32.0);
    let specular = uniforms.specularColor * specularFactor * uniforms.specularIntensity;
    
    // Combine lighting components
    let finalColor = ambient + diffuse + specular;
    
    return vec4f(finalColor, origColor.a);
}
