/*
 * Bloom composite pass
 * Adds tinted bloom to the original HDR scene
 * All operations in linear color space
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D bloomTex;
uniform float intensity;
uniform vec3 tint;

out vec4 fragColor;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    
    // Get original scene color (HDR)
    vec4 sceneColor = texelFetch(inputTex, coord, 0);
    
    // Get bloom color
    vec3 bloom = texelFetch(bloomTex, coord, 0).rgb;
    
    // Apply tint
    bloom *= tint;

    // Additive blend: finalHDR = sceneColor + intensity * bloom
    vec3 finalRgb = sceneColor.rgb + intensity * bloom;
    
    fragColor = vec4(finalRgb, sceneColor.a);
}
