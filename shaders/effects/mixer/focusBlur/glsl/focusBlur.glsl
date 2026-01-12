/*
 * Focus blur (depth of field) mixer shader
 * Reconstructs a faux depth buffer from luminance to drive circle-of-confusion blurs
 * Blur radius is based on distance from focal point
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float focalDistance;
uniform float aperture;
uniform float sampleBias;
uniform int depthSource;

out vec4 fragColor;

// Convert RGB to luminosity for depth estimation
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// Compute blur factor based on depth distance from focal plane
float computeBlurFactor(float depth) {
    float focalPlane = focalDistance * 0.01;
    float blur = abs(depth - focalPlane) * aperture;
    return clamp(blur, 0.0, 1.0);
}

// Apply depth of field blur
vec4 applyFocusBlur(sampler2D sceneTex, sampler2D depthTex, vec2 uv) {
    // Sample depth texture and compute luminosity as depth proxy
    vec4 depthSample = texture(depthTex, uv);
    float depth = getLuminosity(depthSample.rgb);
    
    // Calculate blur amount based on distance from focal plane
    float blurFactor = computeBlurFactor(depth) * 10.0;
    
    vec4 color = vec4(0.0);
    float totalWeight = 0.0;
    
    // Gaussian blur convolution kernel (9x9)
    for (int x = -4; x <= 4; x++) {
        for (int y = -4; y <= 4; y++) {
            vec2 offset = vec2(float(x), float(y)) * sampleBias / resolution;
            
            // Gaussian weight based on distance from center
            float dist2 = float(x * x + y * y);
            float sigma2 = 2.0 * blurFactor * blurFactor;
            float weight = exp(-dist2 / max(sigma2, 0.001));
            
            color += texture(sceneTex, uv + offset) * weight;
            totalWeight += weight;
        }
    }
    
    return color / totalWeight;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    
    vec4 color;
    
    // depthSource: 0 = use inputTex (A) as depth map, blur tex (B)
    //              1 = use tex (B) as depth map, blur inputTex (A)
    if (depthSource == 0) {
        color = applyFocusBlur(tex, inputTex, uv);
    } else {
        color = applyFocusBlur(inputTex, tex, uv);
    }
    
    // Preserve maximum alpha from both sources
    color.a = max(texture(inputTex, uv).a, texture(tex, uv).a);
    
    fragColor = color;
}
