/*
 * Spiral distortion
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform float strength;
uniform int speed;
uniform bool aspectLens;
uniform int wrap;
uniform float rotation;
uniform bool antialias;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

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

    uv -= 0.5;

    if (aspectLens) {
        uv.x *= aspectRatio;
    }

    // Convert to polar coordinates
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Apply spiral distortion
    float spiralAmt = (strength * 0.05) * r;
    a += spiralAmt - (time * TAU * float(speed) * sign(strength));

    // Convert back to cartesian coordinates
    uv = vec2(cos(a), sin(a)) * r;

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

    if (antialias) {
        vec2 dx = dFdx(uv);
        vec2 dy = dFdy(uv);
        vec4 col = vec4(0.0);
        col += texture(inputTex, uv + dx * -0.375 + dy * -0.125);
        col += texture(inputTex, uv + dx *  0.125 + dy * -0.375);
        col += texture(inputTex, uv + dx *  0.375 + dy *  0.125);
        col += texture(inputTex, uv + dx * -0.125 + dy *  0.375);
        fragColor = col * 0.25;
    } else {
        fragColor = texture(inputTex, uv);
    }
}
