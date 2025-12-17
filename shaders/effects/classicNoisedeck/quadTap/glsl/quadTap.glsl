#version 300 es

/*
 * Quad Tap shader.
 * Four-corner color gradient with animated hue shift.
 */

precision highp float;
precision highp int;

uniform float time;
uniform vec2 resolution;
uniform float loopAmp;
uniform float intensity;
uniform vec4 color1;
uniform vec4 color2;
uniform vec4 color3;
uniform vec4 color4;
out vec4 fragColor;

#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

vec3 brightnessContrast(vec3 color) {
    float bright = map(intensity, -100.0, 100.0, -0.4, 0.4);
    float cont = 1.0;
    if ( intensity < 0.0) {
        cont = map(intensity, -100.0, 0.0, 0.5, 1.0);
    } else {
        cont = map(intensity, 0.0, 100.0, 1.0, 1.5);
    }

    color = (color - 0.5) * cont + 0.5 + bright;
    return color;
}

vec3 hsv2rgb(vec3 hsv) {
    float h = fract(hsv.x);
    float s = hsv.y;
    float v = hsv.z;
    
    float c = v * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = v - c;

    vec3 rgb;

    if (0.0 <= h && h < 1.0/6.0) {
        rgb = vec3(c, x, 0.0);
    } else if (1.0/6.0 <= h && h < 2.0/6.0) {
        rgb = vec3(x, c, 0.0);
    } else if (2.0/6.0 <= h && h < 3.0/6.0) {
        rgb = vec3(0.0, c, x);
    } else if (3.0/6.0 <= h && h < 4.0/6.0) {
        rgb = vec3(0.0, x, c);
    } else if (4.0/6.0 <= h && h < 5.0/6.0) {
        rgb = vec3(x, 0.0, c);
    } else if (5.0/6.0 <= h && h < 1.0) {
        rgb = vec3(c, 0.0, x);
    } else {
        rgb = vec3(0.0, 0.0, 0.0);
    }

    return rgb + vec3(m, m, m);
}

vec3 rgb2hsv(vec3 rgb) {
    float r = rgb.r;
    float g = rgb.g;
    float b = rgb.b;
    
    float max = max(r, max(g, b));
    float min = min(r, min(g, b));
    float delta = max - min;

    float h = 0.0;
    if (delta != 0.0) {
        if (max == r) {
            h = mod((g - b) / delta, 6.0) / 6.0;
        } else if (max == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (max == b) {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    
    float s = (max == 0.0) ? 0.0 : delta / max;
    float v = max;

    return vec3(h, s, v);
}

void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution.y;
    st -= vec2(aspectRatio * 0.5, 0.5);

    // Shift to 0-1 range for gradient
    st += vec2(aspectRatio * 0.5, 0.5);
    
    float speed = loopAmp * 0.02;
    vec3 x0 = vec3(1.0);
    vec3 x1 = vec3(1.0);

    vec3 c1 = rgb2hsv(color1.rgb);
    vec3 c2 = rgb2hsv(color2.rgb);
    vec3 c3 = rgb2hsv(color3.rgb);
    vec3 c4 = rgb2hsv(color4.rgb);

    c1[0] += (sin(time * TAU * speed) + 1.0) * 0.05;
    c2[0] += (sin((0.25 - time) * TAU * speed) + 1.0) * 0.05;
    c3[0] += (sin((0.5 - time) * TAU * speed) + 1.0) * 0.05;
    c4[0] += (sin((0.75 + time) * TAU * speed) + 1.0) * 0.05;

    c1 = hsv2rgb(c1);
    c2 = hsv2rgb(c2);
    c3 = hsv2rgb(c3);
    c4 = hsv2rgb(c4);

    x0.rgb = mix(c1, c2, st.x);
    x1.rgb = mix(c3, c4, st.x);

    color.rgb = mix(x0, x1, 1.0 - st.y);
    color.rgb = brightnessContrast(color.rgb);
    color.a = 1.0;

    fragColor = color;
}
