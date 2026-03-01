/*
 * Skew and rotate transform
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float skewAmt;
uniform float rotation;
uniform float wrap;

out vec4 fragColor;

const float PI = 3.14159265359;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 st = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / resolution.y;

    // Center, aspect-correct, rotate, skew, undo aspect, uncenter
    st -= 0.5;
    st.x *= aspect;

    float angle = rotation * PI / 180.0;
    float c = cos(angle);
    float s = sin(angle);
    st = mat2(c, -s, s, c) * st;

    st.x += st.y * -skewAmt;

    st.x /= aspect;
    st += 0.5;

    // Wrap mode
    int wrapMode = int(wrap);
    if (wrapMode == 0) {
        // clamp
        st = clamp(st, 0.0, 1.0);
    } else if (wrapMode == 1) {
        // mirror
        st = abs(mod(st + 1.0, 2.0) - 1.0);
    } else {
        // repeat
        st = fract(st);
    }

    fragColor = texture(inputTex, st);
}
