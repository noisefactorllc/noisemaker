#version 300 es
precision highp float;

uniform sampler2D sourceTex;
uniform vec2 resolution;
uniform float intensity;
uniform bool resetState;

out vec4 fragColor;

void main() {
    // If resetState is true, clear the trail
    if (resetState) {
        fragColor = vec4(0.0);
        return;
    }
    
    vec2 uv = gl_FragCoord.xy / resolution;
    
    // Sample the trail texture directly (no blur)
    vec4 trailColor = texture(sourceTex, uv);
    
    // Apply intensity decay (persistence) - faithfully matches reference implementation
    // intensity=100 means no decay, intensity=0 means instant fade
    float decay = clamp(intensity / 100.0, 0.0, 1.0);
    fragColor = trailColor * decay;
}
