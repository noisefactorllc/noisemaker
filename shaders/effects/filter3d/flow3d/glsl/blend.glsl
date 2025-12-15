#version 300 es
precision highp float;
/*
 * Flow3D blend pass - Combine input 3D volume with trail 3D volume
 * Direct port of nu/flow blend.glsl to 3D atlas format
 * 
 * Both mixerTex (inputTex3d) and trailTex are 2D atlas representations
 * of 3D volumes (width=volumeSize, height=volumeSize²)
 */

uniform sampler2D mixerTex;
uniform sampler2D trailTex;
uniform float inputIntensity;

out vec4 fragColor;

void main() {
    // Use actual output texture size, not canvas resolution
    ivec2 outputSize = textureSize(trailTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(outputSize);
    
    // Both textures are 3D atlas format, sample directly
    float inputIntensityValue = inputIntensity / 100.0;
    vec4 baseSample = texture(mixerTex, uv);
    vec4 baseColor = vec4(baseSample.rgb * inputIntensityValue, baseSample.a);
    
    vec4 trailColor = texture(trailTex, uv);
    
    // Combine: add trail on top of input (same as 2D flow)
    vec3 combinedRgb = clamp(baseColor.rgb + trailColor.rgb, vec3(0.0), vec3(1.0));
    float finalAlpha = clamp(max(baseColor.a, trailColor.a), 0.0, 1.0);
    
    fragColor = vec4(combinedRgb, finalAlpha);
}
