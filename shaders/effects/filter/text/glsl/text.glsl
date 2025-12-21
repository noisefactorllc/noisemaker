/*
 * Text overlay shader.
 * Blends pre-rendered text texture over an input image.
 * The text is rendered to a 2D canvas on the CPU side and uploaded as a texture.
 *
 * The canvas has:
 * - Text pixels: full alpha (1.0) with text color
 * - Background pixels: alpha = bgOpacity with bgColor
 *
 * We blend so that:
 * - Text areas show text color over input
 * - Background areas blend bgColor over input by bgOpacity amount
 * - Final alpha is always preserved from input
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

    vec4 input_ = texture(inputTex, st);
    vec4 text = texture(textTex, st);
    
    // The canvas encodes both text and background in the texture.
    // Text has alpha = 1.0, background has alpha = bgOpacity.
    // We use the canvas color directly, blending by its alpha,
    // but preserve the INPUT's alpha channel for the output.
    
    vec3 result = mix(input_.rgb, text.rgb, text.a);
    
    // Preserve input alpha - bgOpacity shouldn't affect final alpha
    fragColor = vec4(result, input_.a);
}
