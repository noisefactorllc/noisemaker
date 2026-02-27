/*
 * Bloom bright-pass extraction
 * Isolates highlight energy using threshold + soft knee
 * All math in linear color space
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float threshold;
uniform float softKnee;

out vec4 fragColor;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(inputTex, coord, 0);
    
    // Compute luminance (Rec. 709)
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    
    // Soft knee thresholding
    // Below (threshold - knee) -> 0
    // Between (threshold - knee) and (threshold + knee) -> smooth ramp
    // Above (threshold + knee) -> 1
    float knee = softKnee;
    float threshLow = threshold - knee;
    float threshHigh = threshold + knee;
    
    float bloomFactor;
    if (luma <= threshLow) {
        bloomFactor = 0.0;
    } else if (luma >= threshHigh) {
        bloomFactor = 1.0;
    } else {
        // Smoothstep for the soft knee region
        float t = (luma - threshLow) / (threshHigh - threshLow);
        bloomFactor = t * t * (3.0 - 2.0 * t);
    }
    
    // Multiply original HDR color by bloom factor
    vec3 brightColor = color.rgb * bloomFactor;
    
    fragColor = vec4(brightColor, color.a);
}
