#version 300 es
precision highp float;

// Diffuse Pass - Decay existing trail

uniform sampler2D trailTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float decay;
uniform bool resetState;

out vec4 fragColor;

void main() {
    // If resetState is true, clear the trail
    if (resetState) {
        fragColor = vec4(0.0);
        return;
    }
    
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;

    // Sample the trail texture directly (no blur)
    vec4 trailColor = texture(trailTex, uv);
    
    // Apply decay
    // decay=0 means no decay (persistence 1.0)
    // decay=1 means instant fade (persistence 0.0)
    float persistence = clamp(1.0 - decay, 0.0, 1.0);
    fragColor = trailColor * persistence;
}
