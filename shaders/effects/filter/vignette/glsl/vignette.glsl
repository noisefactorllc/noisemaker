/*
 * Radial vignette with brightness blend
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float vignetteBrightness;
uniform float vignetteAlpha;

out vec4 fragColor;

float computeVignetteMask(vec2 uv, vec2 dims) {
    if (dims.x <= 0.0 || dims.y <= 0.0) {
        return 0.0;
    }
    
    vec2 delta = abs(uv - vec2(0.5));
    float aspect = dims.x / max(dims.y, 1.0);
    vec2 scaled = vec2(delta.x * aspect, delta.y);
    float maxRadius = length(vec2(aspect * 0.5, 0.5));
    
    if (maxRadius <= 0.0) {
        return 0.0;
    }
    
    float normalizedDist = clamp(length(scaled) / maxRadius, 0.0, 1.0);
    return normalizedDist * normalizedDist;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 dims = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / dims;
    
    vec4 texel = texture(inputTex, uv);
    
    float mask = computeVignetteMask(uv, dims);
    
    // Apply brightness to RGB only, preserve alpha
    vec3 brightnessRgb = vec3(vignetteBrightness);
    vec3 edgeBlend = mix(texel.rgb, brightnessRgb, mask);
    vec3 finalRgb = mix(texel.rgb, edgeBlend, vignetteAlpha);
    
    fragColor = vec4(finalRgb, texel.a);
}
