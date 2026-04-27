/*
 * Pixelation effect
 * Reduces image resolution for retro pixel art look
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float size;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    
    if (size < 1.0) {
        fragColor = texture(inputTex, uv);
        return;
    }
    
    float pixelSize = size;
    
    float dx = pixelSize / resolution.x;
    float dy = pixelSize / resolution.y;
    
    vec2 centered = uv - 0.5;
    vec2 coord = vec2(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
    coord += 0.5;
    
    fragColor = texture(inputTex, coord);
}
