/*
 * Rotate image 0..1 (0..360 degrees)
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float rotation;
uniform int wrap;
uniform int speed;
uniform float time;

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
    
    // Animate rotation: full continuous rotation
    float angle = rotation;
    if (speed != 0) {
        angle += time * 360.0 * float(speed);
    }

    // Center, correct aspect, rotate, uncorrect, uncenter
    float aspect = float(texSize.x) / float(texSize.y);
    vec2 center = vec2(0.5);
    uv -= center;
    uv.x *= aspect;
    uv = rotate2D(-angle * TAU / 360.0) * uv;
    uv.x /= aspect;
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
