#version 300 es
precision highp float;

// Diffuse/Decay Pass - Fade trails over time

uniform vec2 resolution;
uniform sampler2D sourceTex;
uniform float trailIntensity;
uniform bool resetState;

out vec4 fragColor;

void main() {
    if (resetState) {
        fragColor = vec4(0.0);
        return;
    }
    
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 trail = texture(sourceTex, uv);
    
    // Decay based on trail intensity (higher = slower decay)
    float decay = trailIntensity * 0.01;
    
    // Apply decay
    fragColor = vec4(trail.rgb * decay, trail.a);
}
