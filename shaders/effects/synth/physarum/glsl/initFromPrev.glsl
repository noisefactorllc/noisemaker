#version 300 es
precision highp float;

uniform sampler2D prevTrailTex;
uniform float intensity;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(prevTrailTex, 0));
    vec4 prev = texture(prevTrailTex, uv);
    
    // Fade previous frame's trail based on intensity (persistence)
    float fade = intensity / 100.0;
    fragColor = prev * fade;
}
