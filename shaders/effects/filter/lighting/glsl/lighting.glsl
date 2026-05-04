/*
 * 3D lighting effect for 2D textures
 * Calculates surface normals from luminosity using Sobel convolution
 * and applies diffuse, specular, and ambient lighting
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform vec3 diffuseColor;
uniform vec3 specularColor;
uniform float specularIntensity;
uniform float shininess;
uniform vec3 ambientColor;
uniform vec3 lightDirection;
uniform float normalStrength;
uniform float smoothing;
uniform float renderScale;
uniform float reflection;
uniform float refraction;
uniform float aberration;

out vec4 fragColor;

// Convert RGB to luminosity
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

// Calculate surface normal from height map using Sobel convolution
vec3 calculateNormal(vec2 uv, vec2 texelSize) {
    // Apply smoothing to texel size for smoother normals
    vec2 sampleSize = texelSize * smoothing * renderScale;
    
    // Sobel X kernel
    float sobel_x[9];
    sobel_x[0] = -1.0; sobel_x[1] = 0.0; sobel_x[2] = 1.0;
    sobel_x[3] = -2.0; sobel_x[4] = 0.0; sobel_x[5] = 2.0;
    sobel_x[6] = -1.0; sobel_x[7] = 0.0; sobel_x[8] = 1.0;
    
    // Sobel Y kernel
    float sobel_y[9];
    sobel_y[0] = -1.0; sobel_y[1] = -2.0; sobel_y[2] = -1.0;
    sobel_y[3] =  0.0; sobel_y[4] =  0.0; sobel_y[5] =  0.0;
    sobel_y[6] =  1.0; sobel_y[7] =  2.0; sobel_y[8] =  1.0;
    
    vec2 offsets[9];
    offsets[0] = vec2(-sampleSize.x, -sampleSize.y);
    offsets[1] = vec2(0.0, -sampleSize.y);
    offsets[2] = vec2(sampleSize.x, -sampleSize.y);
    offsets[3] = vec2(-sampleSize.x, 0.0);
    offsets[4] = vec2(0.0, 0.0);
    offsets[5] = vec2(sampleSize.x, 0.0);
    offsets[6] = vec2(-sampleSize.x, sampleSize.y);
    offsets[7] = vec2(0.0, sampleSize.y);
    offsets[8] = vec2(sampleSize.x, sampleSize.y);
    
    float dx = 0.0;
    float dy = 0.0;
    
    for (int i = 0; i < 9; i++) {
        vec3 texSample = texture(inputTex, uv + offsets[i]).rgb;
        float height = getLuminosity(texSample);
        dx += height * sobel_x[i];
        dy += height * sobel_y[i];
    }
    
    // Scale gradients by normal strength
    dx *= normalStrength;
    dy *= normalStrength;
    
    // Construct normal from gradients
    vec3 normal = normalize(vec3(-dx, -dy, 1.0));
    
    return normal;
}

// Apply refraction effect based on surface normal
vec4 applyRefraction(vec2 uv, vec3 normal) {
    vec2 refractionOffset = normal.xy * (refraction * 0.0125);
    return texture(inputTex, uv + refractionOffset);
}

// Apply reflection effect with chromatic aberration
vec4 applyReflection(vec2 uv, vec2 globalUV, vec3 normal) {
    // Calculate incident vector for reflection, from center of image
    vec3 incident = vec3(normalize(globalUV - 0.5), 100.0);
    
    // Calculate reflection vector
    vec3 reflectionVec = reflect(incident, normal);
    
    // Convert to 2D texture offset
    vec2 reflectionOffset = reflectionVec.xy * (reflection * 0.00005);
    
    // Apply chromatic aberration
    vec2 redOffset = reflectionOffset * (1.0 + aberration * 0.0075);
    vec2 greenOffset = reflectionOffset;
    vec2 blueOffset = reflectionOffset * (1.0 - aberration * 0.0075);
    
    float redChannel = texture(inputTex, uv + redOffset).r;
    float greenChannel = texture(inputTex, uv + greenOffset).g;
    float blueChannel = texture(inputTex, uv + blueOffset).b;
    float alphaChannel = texture(inputTex, uv + reflectionOffset).a;
    
    return vec4(redChannel, greenChannel, blueChannel, alphaChannel);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : resolution;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / fullRes;
    vec2 texelSize = 1.0 / resolution;
    
    // Get original color
    vec4 origColor = texture(inputTex, uv);
    
    // Calculate surface normal
    vec3 normal = calculateNormal(uv, texelSize);
    
    // Normalize light direction
    vec3 lightDir = normalize(lightDirection);
    
    // Calculate view direction (straight at camera)
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    
    // Ambient lighting
    vec3 ambient = ambientColor * origColor.rgb;
    
    // Diffuse lighting (Lambertian)
    float diffuseFactor = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diffuseColor * diffuseFactor * origColor.rgb;
    
    // Specular lighting (Blinn-Phong)
    vec3 halfDir = normalize(lightDir + viewDir);
    float specAngle = max(dot(halfDir, normal), 0.0);
    float specularFactor = pow(specAngle, shininess);
    vec3 specular = specularColor * specularFactor * specularIntensity;
    
    // Combine lighting components
    vec3 litColor = ambient + diffuse + specular;
    vec4 workingColor = vec4(litColor, origColor.a);
    
    // Apply refraction if enabled
    if (refraction > 0.0) {
        vec4 refractedColor = applyRefraction(uv, normal);
        workingColor = mix(workingColor, refractedColor, refraction / 100.0);
    }
    
    // Apply reflection (with chromatic aberration) if enabled
    if (reflection > 0.0 || aberration > 0.0) {
        vec4 reflectedColor = applyReflection(uv, globalUV, normal);
        workingColor = mix(workingColor, reflectedColor, reflection / 100.0);
    }
    
    fragColor = workingColor;
}
