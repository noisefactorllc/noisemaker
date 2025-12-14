#version 300 es
precision highp float;

uniform sampler2D prevTrailTex;
uniform float intensity;
uniform bool resetState;

out vec4 fragColor;

void main() {
    // If resetState is true, clear the trail
    if (resetState) {
        fragColor = vec4(0.0);
        return;
    }
    
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(prevTrailTex, 0));
    vec4 prev = texture(prevTrailTex, uv);
    
    // Fade previous frame's trail based on intensity (persistence)
    float fade = intensity / 100.0;
    fragColor = prev * fade;
}
