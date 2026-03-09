#version 300 es
precision highp float;

uniform sampler2D trailTex;

out vec4 fragColor;

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5) / vec2(textureSize(trailTex, 0));
    vec4 c = texture(trailTex, uv);
    // Slow decay to let fibers accumulate over many frames
    c *= 0.97;
    fragColor = c;
}
