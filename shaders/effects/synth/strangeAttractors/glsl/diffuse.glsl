#version 300 es
precision highp float;

uniform sampler2D sourceTex;
uniform float intensity;

out vec4 fragColor;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 current = texelFetch(sourceTex, coord, 0);
    
    // Decay factor based on intensity (higher = more persistent)
    float decay = intensity * 0.01;
    
    fragColor = current * decay;
}
