#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float mixAmt;
uniform int maskMode;
out vec4 fragColor;

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;


    vec4 color1 = texture(inputTex, st);
    vec4 color2 = texture(tex, st);

    // luminance mask mode
    if (maskMode == 1) {
        float maskVal = dot(color2.rgb, vec3(0.299, 0.587, 0.114));
        fragColor = vec4(color1.rgb, color1.a * maskVal);
        return;
    }

    // alpha blend
    vec4 middle = mix(color1, color2, color2.a);

    float amt = map(mixAmt, -100.0, 100.0, 0.0, 1.0);
    vec4 color;
    if (amt < 0.5) {
        float factor = amt * 2.0;
        color = mix(color1, middle, factor);
    } else {
        float factor = (amt - 0.5) * 2.0;
        color = mix(middle, color2, factor);
    }

    color.a = max(color1.a, color2.a);
    fragColor = color;
}
