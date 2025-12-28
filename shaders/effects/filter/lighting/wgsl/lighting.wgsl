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
    reflection: f32,
    refraction: f32,
    aberration: f32,
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

// Apply refraction effect based on surface normal
fn applyRefraction(uv: vec2f, normal: vec3f) -> vec4f {
    let refractionOffset = normal.xy * (uniforms.refraction * 0.25);
    return textureSample(inputTex, inputSampler, uv + refractionOffset);
}

// Apply reflection effect with chromatic aberration
fn applyReflection(uv: vec2f, normal: vec3f) -> vec4f {
    // Calculate incident vector for reflection, from center of image
    let incident = vec3f(normalize(uv - 0.5), 100.0);
    
    // Calculate reflection vector
    let reflectionVec = reflect(incident, normal);
    
    // Convert to 2D texture offset
    let reflectionOffset = reflectionVec.xy * (uniforms.reflection * 0.0005);
    
    // Apply chromatic aberration
    let redOffset = reflectionOffset * (1.0 + uniforms.aberration * 0.01);
    let greenOffset = reflectionOffset;
    let blueOffset = reflectionOffset * (1.0 - uniforms.aberration * 0.01);
    
    let redChannel = textureSample(inputTex, inputSampler, uv + redOffset).r;
    let greenChannel = textureSample(inputTex, inputSampler, uv + greenOffset).g;
    let blueChannel = textureSample(inputTex, inputSampler, uv + blueOffset).b;
    let alphaChannel = textureSample(inputTex, inputSampler, uv + reflectionOffset).a;
    
    return vec4f(redChannel, greenChannel, blueChannel, alphaChannel);
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
    
    // Apply refraction if enabled
    var workingColor = origColor;
    if (uniforms.refraction > 0.0) {
        workingColor = applyRefraction(uv, normal);
    }
    
    // Apply reflection (with chromatic aberration) if enabled
    if (uniforms.reflection > 0.0 || uniforms.aberration > 0.0) {
        let reflectedColor = applyReflection(uv, normal);
        workingColor = mix(workingColor, reflectedColor, uniforms.reflection / 100.0);
    }
    
    // Normalize light direction
    let lightDir = normalize(uniforms.lightDirection);
    
    // Calculate view direction (straight at camera)
    let viewDir = vec3f(0.0, 0.0, 1.0);
    
    // Ambient lighting
    let ambient = uniforms.ambientColor * workingColor.rgb;
    
    // Diffuse lighting (Lambertian)
    let diffuseFactor = max(dot(normal, lightDir), 0.0);
    let diffuse = uniforms.diffuseColor * diffuseFactor * workingColor.rgb;
    
    // Specular lighting (Blinn-Phong)
    let halfDir = normalize(lightDir + viewDir);
    let specularFactor = pow(max(dot(normal, halfDir), 0.0), 32.0);
    let specular = uniforms.specularColor * specularFactor * uniforms.specularIntensity;
    
    // Combine lighting components
    let finalColor = ambient + diffuse + specular;
    
    return vec4f(finalColor, workingColor.a);
}
