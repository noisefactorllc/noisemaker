/*
 * Translate image X and Y
 */

#ifdef GL_ES
precision highp float;
#endif

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform float x;
uniform float y;
uniform int wrap;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    
    // Apply translation
    uv.x = uv.x - x;
    uv.y = uv.y - y;
    
    // Apply wrap mode
    if (wrap == 0) {
        // mirror
        uv = abs(mod(uv + 1.0, 2.0) - 1.0);
    } else if (wrap == 1) {
        // repeat
        uv = fract(uv);
    } else {
        // clamp
        uv = clamp(uv, 0.0, 1.0);
    }

    fragColor = texture(inputTex, uv);
}
