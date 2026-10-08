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
    shininess: f32,
    lightDirection: vec3f,
    normalStrength: f32,
    smoothing: f32,
    reflection: f32,
    refraction: f32,
    aberration: f32,
    renderScale: f32,
    _pad2: f32,
    tileOffset: vec2f,
    fullResolution: vec2f,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var heightMap: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

// Convert RGB to luminosity
fn getLuminosity(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

fn getHeight(uv: vec2f) -> f32 {
    let mapSize = vec2f(textureDimensions(heightMap, 0));
    let localUV = (uv * uniforms.fullResolution - uniforms.tileOffset) / mapSize;
    return getLuminosity(textureSample(heightMap, inputSampler, localUV).rgb);
}

// Calculate surface normal from height map using Sobel convolution
fn calculateNormal(uv: vec2f, texelSize: vec2f) -> vec3f {
    // Apply smoothing to texel size for smoother normals
    let sampleSize = texelSize * uniforms.smoothing * uniforms.renderScale;
    
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
        let height = getHeight(uv + offsets[i]);
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
    let refractionOffset = normal.xy * (uniforms.refraction * 0.0125);
    return textureSample(inputTex, inputSampler, ((uv + refractionOffset) * uniforms.fullResolution - uniforms.tileOffset) / vec2f(textureDimensions(inputTex, 0)));
}

// Apply reflection effect with chromatic aberration
fn applyReflection(uv: vec2f, globalUV: vec2f, normal: vec3f) -> vec4f {
    // Calculate incident vector for reflection, from center of image
    let incident = vec3f(normalize(globalUV - 0.5), 100.0);
    
    // Calculate reflection vector
    let reflectionVec = reflect(incident, normal);
    
    // Convert to 2D texture offset
    let reflectionOffset = reflectionVec.xy * (uniforms.reflection * 0.00005);
    
    // Apply chromatic aberration
    let redOffset = reflectionOffset * (1.0 + uniforms.aberration * 0.0075);
    let greenOffset = reflectionOffset;
    let blueOffset = reflectionOffset * (1.0 - uniforms.aberration * 0.0075);
    
    let redChannel = textureSample(inputTex, inputSampler, ((uv + redOffset) * uniforms.fullResolution - uniforms.tileOffset) / vec2f(textureDimensions(inputTex, 0))).r;
    let greenChannel = textureSample(inputTex, inputSampler, ((uv + greenOffset) * uniforms.fullResolution - uniforms.tileOffset) / vec2f(textureDimensions(inputTex, 0))).g;
    let blueChannel = textureSample(inputTex, inputSampler, ((uv + blueOffset) * uniforms.fullResolution - uniforms.tileOffset) / vec2f(textureDimensions(inputTex, 0))).b;
    let alphaChannel = textureSample(inputTex, inputSampler, ((uv + reflectionOffset) * uniforms.fullResolution - uniforms.tileOffset) / vec2f(textureDimensions(inputTex, 0))).a;
    
    return vec4f(redChannel, greenChannel, blueChannel, alphaChannel);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let globalCoord = pos.xy + uniforms.tileOffset;
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let resolution = texSize;
    let fullRes = select(resolution, uniforms.fullResolution, uniforms.fullResolution.x > 0.0);
    let uv = globalCoord / uniforms.fullResolution;
    let globalUV = (pos.xy + uniforms.tileOffset) / fullRes;
    let texelSize = 1.0 / resolution;
    
    // Get original color
    let origColor = textureSample(inputTex, inputSampler, pos.xy / vec2f(textureDimensions(inputTex, 0)));
    
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
    let specAngle = max(dot(halfDir, normal), 0.0);
    let specularFactor = pow(specAngle, uniforms.shininess);
    let specular = uniforms.specularColor * specularFactor * uniforms.specularIntensity;
    
    // Combine lighting components
    let litColor = ambient + diffuse + specular;
    var workingColor = vec4f(litColor, origColor.a);
    
    // Apply refraction if enabled
    if (uniforms.refraction > 0.0) {
        let refractedColor = applyRefraction(uv, normal);
        workingColor = mix(workingColor, refractedColor, uniforms.refraction / 100.0);
    }
    
    // Apply reflection (with chromatic aberration) if enabled
    if (uniforms.reflection > 0.0 || uniforms.aberration > 0.0) {
        let reflectedColor = applyReflection(uv, globalUV, normal);
        workingColor = mix(workingColor, reflectedColor, uniforms.reflection / 100.0);
    }
    
    return workingColor;
}
