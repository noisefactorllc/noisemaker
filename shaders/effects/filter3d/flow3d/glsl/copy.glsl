#version 300 es
precision highp float;

// Copy Pass - Blit source to destination (for ping-pong correction after diffuse)
// This ensures the decayed trail is in the write buffer before deposit blends onto it

uniform sampler2D sourceTex;

out vec4 fragColor;

void main() {
    // Use actual texture size, not canvas resolution
    ivec2 texSize = textureSize(sourceTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    fragColor = texture(sourceTex, uv);
}
