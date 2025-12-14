/*
 * Pinch distortion
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float strength;
uniform bool aspectLens;
uniform int wrap;
uniform float rotation;

out vec4 fragColor;

#define PI 3.14159265359

vec2 rotate2D(vec2 st, float rot, float aspectRatio) {
    st.x *= aspectRatio;
    float angle = rot * PI;
    st -= vec2(0.5 * aspectRatio, 0.5);
    st = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * st;
    st += vec2(0.5 * aspectRatio, 0.5);
    st.x /= aspectRatio;
    return st;
}

void main() {
    float aspectRatio = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;

    // Apply rotation before distortion
    uv = rotate2D(uv, rotation / 180.0, aspectRatio);

    float intensity = strength * 0.01;

    uv -= 0.5;

    if (aspectLens) {
        uv.x *= aspectRatio;
    }

    float r = length(uv);
    float effect = pow(r, 1.0 - intensity);
    uv = normalize(uv) * effect;

    if (aspectLens) {
        uv.x /= aspectRatio;
    }

    uv += 0.5;

    // Apply wrap mode
    if (wrap == 0) {
        // mirror
        uv = abs(mod(uv + 1.0, 2.0) - 1.0);
    } else if (wrap == 1) {
        // repeat
        uv = mod(uv, 1.0);
    } else {
        // clamp
        uv = clamp(uv, 0.0, 1.0);
    }

    // Reverse rotation after distortion
    uv = rotate2D(uv, -rotation / 180.0, aspectRatio);

    fragColor = texture(inputTex, uv);
}
