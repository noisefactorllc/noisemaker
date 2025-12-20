/*
 * Text overlay shader.
 * Blends pre-rendered text texture over an input image.
 * The text is rendered to a 2D canvas on the CPU side and uploaded as a texture.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D textTex;
uniform vec2 resolution;
uniform float time;
uniform float seed;

out vec4 fragColor;

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 bg = texture(inputTex, st);
    vec4 text = texture(textTex, st);
    
    // Alpha blend text over background
    fragColor = mix(bg, text, text.a);
}
