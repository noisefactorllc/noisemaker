/*
 * Rotate image 0..1 (0..360 degrees)
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float rotation;
uniform int wrap;

out vec4 fragColor;

const float TAU = 6.283185307179586;

mat2 rotate2D(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    
    // Center, rotate, uncenter
    vec2 center = vec2(0.5);
    uv -= center;
    uv = rotate2D(rotation * TAU) * uv;
    uv += center;
    
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
