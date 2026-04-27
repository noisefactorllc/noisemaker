/*
 * Sine wave distortion
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;
uniform float strength;
uniform float scale;
uniform int speed;
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
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    float aspectRatio = fullResolution.x / fullResolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 globalUV = globalCoord / fullResolution;

    // Work in global UV space for consistent distortion
    vec2 warpUV = globalUV;

    // Apply rotation before distortion
    warpUV = rotate2D(warpUV, rotation / 180.0, aspectRatio);

    // Sine wave distortion
    warpUV.y += sin(warpUV.x * scale * 10.0 + time * TAU * float(speed)) * (strength * 0.01);

    // Apply wrap mode
    if (wrap == 0) {
        // mirror
        warpUV = abs(mod(warpUV + 1.0, 2.0) - 1.0);
    } else if (wrap == 1) {
        // repeat
        warpUV = mod(warpUV, 1.0);
    } else {
        // clamp
        warpUV = clamp(warpUV, 0.0, 1.0);
    }

    // Reverse rotation after distortion
    warpUV = rotate2D(warpUV, -rotation / 180.0, aspectRatio);

    // Map back to tile-local UV for texture sampling
    uv = warpUV;

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
