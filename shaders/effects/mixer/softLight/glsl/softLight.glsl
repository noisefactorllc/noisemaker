#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float mixAmt;
out vec4 fragColor;

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float blendSoftLight(float base, float blend) {
    return (blend < 0.5)
        ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend))
        : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    

    vec4 color1 = texture(inputTex, st);
    vec4 color2 = texture(tex, st);

    // soft light blend
    vec4 middle = vec4(
        blendSoftLight(color1.r, color2.r),
        blendSoftLight(color1.g, color2.g),
        blendSoftLight(color1.b, color2.b),
        mix(color1.a, color2.a, 0.5)
    );

    float amt = map(mixAmt, -100.0, 100.0, 0.0, 1.0);
    vec4 color;
    if (amt < 0.5) {
        color = mix(color1, middle, amt * 2.0);
    } else {
        color = mix(middle, color2, (amt - 0.5) * 2.0);
    }

    color.a = max(color1.a, color2.a);
    fragColor = color;
}
