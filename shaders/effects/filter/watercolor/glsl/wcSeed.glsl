/*
 * Watercolor - seed pass: copies the source image into the ping-pong state
 * texture before the iterated stride-median simplify passes run.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    fragColor = texture(inputTex, uv);
}
