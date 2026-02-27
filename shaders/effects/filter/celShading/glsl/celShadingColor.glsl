/*
 * Cel Shading - Color Pass
 * Applies color quantization and diffuse shading
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform int levels;
uniform vec3 lightDirection;
uniform float strength;

out vec4 fragColor;

// Convert RGB to luminosity
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

// Quantize a single value using round quantization
float quantizeValue(float value, float lev) {
    if (lev <= 1.0) {
        return value;
    }
    
    float gamma = 0.65;
    float corrected = pow(value, gamma);
    
    // Round quantization - centered steps
    float quantized = floor(corrected * lev + 0.5) / lev;
    
    return pow(quantized, 1.0 / gamma);
}

// Per-channel quantization
vec3 quantizeColor(vec3 color, float lev) {
    return vec3(
        quantizeValue(color.r, lev),
        quantizeValue(color.g, lev),
        quantizeValue(color.b, lev)
    );
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    
    vec4 origColor = texture(inputTex, uv);
    float lev = float(levels);
    
    // Apply diffuse shading based on light direction
    // Use a simple gradient based on UV for subtle shading variation
    vec3 lightDir = normalize(lightDirection);
    float gradientShade = dot(normalize(vec3(uv - 0.5, 0.5)), lightDir);
    float diffuse = 0.5 + 0.5 * gradientShade;
    
    // Apply shading to color
    float shadeFactor = mix(1.0, 0.5 + 0.5 * diffuse, strength);
    vec3 shadedColor = origColor.rgb * shadeFactor;
    
    // Quantize the color
    vec3 quantizedColor = quantizeColor(shadedColor, lev);
    
    fragColor = vec4(quantizedColor, origColor.a);
}
