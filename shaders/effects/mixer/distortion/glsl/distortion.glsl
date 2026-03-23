/*
 * Distortion mixer shader
 * Applies displacement, reflection, and refraction effects between two surfaces
 * Uses Sobel convolution to calculate surface normals from luminosity
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform int mode;
uniform int mapSource;
uniform float intensity;
uniform int wrap;
uniform float smoothing;
uniform float aberration;
uniform bool antialias;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

// Convert RGB to luminosity
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

// Calculate surface normal from height map using Sobel convolution
vec3 calculateNormal(vec2 uv, vec2 texelSize, sampler2D mapTex) {
    // Apply smoothing to texel size for smoother normals
    vec2 sampleSize = texelSize * smoothing;
    
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
        vec3 texSample = texture(mapTex, uv + offsets[i]).rgb;
        float height = getLuminosity(texSample);
        dx += height * sobel_x[i];
        dy += height * sobel_y[i];
    }
    
    // Scale gradients by intensity
    float normalStrength = intensity * 0.1;
    dx *= normalStrength;
    dy *= normalStrength;
    
    // Construct normal from gradients
    vec3 normal = normalize(vec3(-dx, -dy, 1.0));
    
    return normal;
}

// Apply wrap mode to coordinates
vec2 wrapCoords(vec2 st) {
    if (wrap == 0) {
        // mirror
        st = abs(mod(st, 2.0) - 1.0);
        st = 1.0 - st;
    } else if (wrap == 1) {
        // repeat
        st = fract(st);
    } else if (wrap == 2) {
        // clamp
        st = clamp(st, 0.0, 1.0);
    }
    return st;
}

// Displacement effect based on color luminosity
vec4 applyDisplacement(vec2 uv, sampler2D mapTex, sampler2D targetTex) {
    vec4 mapColor = texture(mapTex, uv);
    float len = length(mapColor.rgb);
    
    vec2 offset;
    offset.x = cos(len * TAU) * (intensity * 0.001);
    offset.y = sin(len * TAU) * (intensity * 0.001);
    
    vec2 displacedUV = wrapCoords(uv + offset);

    if (antialias) {
        vec2 dx = dFdx(displacedUV);
        vec2 dy = dFdy(displacedUV);
        vec4 col = vec4(0.0);
        col += texture(targetTex, displacedUV + dx * -0.375 + dy * -0.125);
        col += texture(targetTex, displacedUV + dx *  0.125 + dy * -0.375);
        col += texture(targetTex, displacedUV + dx *  0.375 + dy *  0.125);
        col += texture(targetTex, displacedUV + dx * -0.125 + dy *  0.375);
        return col * 0.25;
    } else {
        return texture(targetTex, displacedUV);
    }
}

// Refraction effect based on surface normal
vec4 applyRefraction(vec2 uv, vec2 texelSize, sampler2D mapTex, sampler2D targetTex) {
    vec3 normal = calculateNormal(uv, texelSize, mapTex);
    vec2 refractionOffset = normal.xy * (intensity * 0.0125);
    vec2 refractedUV = wrapCoords(uv + refractionOffset);

    if (antialias) {
        vec2 dx = dFdx(refractedUV);
        vec2 dy = dFdy(refractedUV);
        vec4 col = vec4(0.0);
        col += texture(targetTex, refractedUV + dx * -0.375 + dy * -0.125);
        col += texture(targetTex, refractedUV + dx *  0.125 + dy * -0.375);
        col += texture(targetTex, refractedUV + dx *  0.375 + dy *  0.125);
        col += texture(targetTex, refractedUV + dx * -0.125 + dy *  0.375);
        return col * 0.25;
    } else {
        return texture(targetTex, refractedUV);
    }
}

// Reflection effect with chromatic aberration
vec4 applyReflection(vec2 uv, vec2 texelSize, sampler2D mapTex, sampler2D targetTex) {
    vec3 normal = calculateNormal(uv, texelSize, mapTex);
    
    // Calculate incident vector for reflection, from center of image
    vec3 incident = vec3(normalize(uv - 0.5), 100.0);
    
    // Calculate reflection vector
    vec3 reflectionVec = reflect(incident, normal);
    
    // Convert to 2D texture offset
    vec2 reflectionOffset = reflectionVec.xy * (intensity * 0.00005);
    
    // Apply chromatic aberration
    vec2 redOffset = reflectionOffset * (1.0 + aberration * 0.0075);
    vec2 greenOffset = reflectionOffset;
    vec2 blueOffset = reflectionOffset * (1.0 - aberration * 0.0075);

    vec2 redUV = wrapCoords(uv + redOffset);
    vec2 greenUV = wrapCoords(uv + greenOffset);
    vec2 blueUV = wrapCoords(uv + blueOffset);
    vec2 alphaUV = wrapCoords(uv + reflectionOffset);

    if (antialias) {
        vec2 dx = dFdx(greenUV);
        vec2 dy = dFdy(greenUV);

        float r = 0.0, g = 0.0, b = 0.0, a = 0.0;
        vec2 o1 = dx * -0.375 + dy * -0.125;
        vec2 o2 = dx *  0.125 + dy * -0.375;
        vec2 o3 = dx *  0.375 + dy *  0.125;
        vec2 o4 = dx * -0.125 + dy *  0.375;

        r += texture(targetTex, redUV + o1).r;
        r += texture(targetTex, redUV + o2).r;
        r += texture(targetTex, redUV + o3).r;
        r += texture(targetTex, redUV + o4).r;

        g += texture(targetTex, greenUV + o1).g;
        g += texture(targetTex, greenUV + o2).g;
        g += texture(targetTex, greenUV + o3).g;
        g += texture(targetTex, greenUV + o4).g;

        b += texture(targetTex, blueUV + o1).b;
        b += texture(targetTex, blueUV + o2).b;
        b += texture(targetTex, blueUV + o3).b;
        b += texture(targetTex, blueUV + o4).b;

        a += texture(targetTex, alphaUV + o1).a;
        a += texture(targetTex, alphaUV + o2).a;
        a += texture(targetTex, alphaUV + o3).a;
        a += texture(targetTex, alphaUV + o4).a;

        return vec4(r, g, b, a) * 0.25;
    } else {
        float redChannel = texture(targetTex, redUV).r;
        float greenChannel = texture(targetTex, greenUV).g;
        float blueChannel = texture(targetTex, blueUV).b;
        float alphaChannel = texture(targetTex, alphaUV).a;

        return vec4(redChannel, greenChannel, blueChannel, alphaChannel);
    }
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texelSize = 1.0 / resolution;
    
    vec4 color;
    
    // Determine which texture is the map source and which is the target
    // mapSource: 0 = inputTex (A), 1 = tex (B)
    // When A is map, we sample from B with A's normals
    // When B is map, we sample from A with B's normals
    
    if (mode == 0) {
        // Displacement
        if (mapSource == 0) {
            color = applyDisplacement(uv, inputTex, tex);
        } else {
            color = applyDisplacement(uv, tex, inputTex);
        }
    } else if (mode == 1) {
        // Refraction
        if (mapSource == 0) {
            color = applyRefraction(uv, texelSize, inputTex, tex);
        } else {
            color = applyRefraction(uv, texelSize, tex, inputTex);
        }
    } else if (mode == 2) {
        // Reflection
        if (mapSource == 0) {
            color = applyReflection(uv, texelSize, inputTex, tex);
        } else {
            color = applyReflection(uv, texelSize, tex, inputTex);
        }
    }
    
    fragColor = color;
}
