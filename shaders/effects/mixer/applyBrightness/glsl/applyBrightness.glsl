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

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    

    vec4 color1 = texture(inputTex, st);
    vec4 color2 = texture(tex, st);

    // applyBrightness blend: hue/sat from A, value from B
    vec3 a = rgb2hsv(color1.rgb);
    vec3 b = rgb2hsv(color2.rgb);
    vec4 middle = vec4(hsv2rgb(vec3(a.x, a.y, b.z)), 1.0);

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
