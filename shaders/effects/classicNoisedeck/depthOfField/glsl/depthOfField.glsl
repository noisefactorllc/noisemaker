#version 300 es

/*
 * Depth of field post shader.
 * Reconstructs a faux depth buffer from luminance to drive circle-of-confusion blurs over the mixer output.
 * Blur radius is remapped from UI percentages to pixel units so performance stays predictable.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float time;
uniform float focalDistance;
uniform float aperture;
uniform float sampleBias;
uniform int mapSource;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

// Function to compute blur factor based on depth
float computeBlurFactor(float depth) {
    float blur = abs(depth - (focalDistance * 0.01)) * aperture;
    return clamp(blur, 0.0, 1.0);
}

// Function to sample the scene texture with blur
vec4 depthOfField(sampler2D scene, sampler2D depth, vec2 uv, vec2 resolution) {
    vec4 depthValue = texture(depth, uv);
    float luminosity = 0.2126 * depthValue.r + 0.7152 * depthValue.g + 0.0722 * depthValue.b;
    float blurFactor = computeBlurFactor(luminosity) * 10.0;
	
    vec4 color = vec4(0.0);
    float totalWeight = 0.0;
    
    // Convolution kernel
    for (int x = -4; x <= 4; x++) {
        for (int y = -4; y <= 4; y++) {
            vec2 offset = vec2(x, y) * sampleBias / resolution;
            float weight = exp(-(float(x) * float(x) + float(y) * float(y)) / (2.0 * blurFactor * blurFactor));
            color += texture(scene, uv + offset) * weight;
            totalWeight += weight;
        }
    }

    return color / totalWeight;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 color = vec4(1.0);
    if (mapSource == 0) {
        color = depthOfField(tex, inputTex, uv, resolution);
    } else {
        color = depthOfField(inputTex, tex, uv, resolution);
    }
    
    color.a = max(texture(inputTex, uv).a, texture(tex, uv).a);
    fragColor = color;
}
