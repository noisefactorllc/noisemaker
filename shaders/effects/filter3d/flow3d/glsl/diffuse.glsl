#version 300 es
precision highp float;
// Flow3D diffuse pass - decay the 3D trail volume
// Operates on the 2D atlas representation of the 3D volume

uniform sampler2D sourceTex;
uniform float intensity;

out vec4 fragColor;

void main() {
    // Use actual texture size, not canvas resolution
    ivec2 texSize = textureSize(sourceTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    
    // Sample the trail texture directly (no blur for now, matching 2D flow)
    vec4 trailColor = texture(sourceTex, uv);
    
    // Apply intensity decay (persistence)
    // intensity=100 means no decay, intensity=0 means instant fade
    float decay = clamp(intensity / 100.0, 0.0, 1.0);
    fragColor = trailColor * decay;
}
