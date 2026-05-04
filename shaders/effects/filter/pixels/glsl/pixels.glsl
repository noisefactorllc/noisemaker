/*
 * Pixelation effect
 * Reduces image resolution for retro pixel art look
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float size;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 tileDims = vec2(texSize);
    vec2 resolution = fullResolution.x > 0.0 ? fullResolution : tileDims;
    vec2 uv = gl_FragCoord.xy / tileDims;

    if (size < 1.0) {
        fragColor = texture(inputTex, uv);
        return;
    }

    float pixelSize = size;

    float dx = pixelSize / resolution.x;
    float dy = pixelSize / resolution.y;

    // Use global UV so pixel grid aligns across tiles
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / resolution;
    vec2 centered = globalUV - 0.5;
    vec2 globalCoord = vec2(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
    globalCoord += 0.5;

    // Convert back to tile-local UV for sampling
    vec2 coord = (globalCoord * resolution - tileOffset) / tileDims;

    fragColor = texture(inputTex, coord);
}
