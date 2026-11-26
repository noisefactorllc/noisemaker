#version 300 es
precision highp float;

// The overlay over the input, by its alpha times the alpha parameter.

uniform sampler2D inputTex;
uniform sampler2D overlayTex;
uniform float alpha;

out vec4 fragColor;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 base = texelFetch(inputTex, coord, 0);
    vec4 overlay = texelFetch(overlayTex, coord, 0);
    float a = overlay.a * alpha;
    fragColor = vec4(base.rgb * (1.0 - a) + overlay.rgb * a, base.a);
}
