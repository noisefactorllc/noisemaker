#version 300 es

/*
 * Composite blend shader.
 * Implements keyed, splash, and channel-driven blends so two synth feeds can be merged under precise color controls.
 * HSV conversions and distance checks are tuned for normalized inputs to keep greenscreen thresholds consistent between GPUs.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float time;
uniform int seed;
uniform vec3 inputColor;
uniform int blendMode;
uniform float range;
uniform float mixAmt;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718


vec3 hsv2rgb(vec3 hsv) {
    float h = fract(hsv.x);
    float s = hsv.y;
    float v = hsv.z;
    
    float c = v * s; // Chroma
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

vec3 desaturate(vec3 color) {
    vec3 c = rgb2hsv(color);
    c.g = 0.0;
    return hsv2rgb(c);
}

vec3 blend(vec3 color1, vec3 color2) {
    vec3 color = vec3(0.0);
    float cut = range * 0.01;

    if (blendMode == 0) {
        // color splash. isolate input color and desaturate others
        if (distance(inputColor, color1) > range * 0.01) {
            color1 = desaturate(color1);
        }

        if (distance(inputColor, color2) > range * 0.01) {
            color2 = desaturate(color2);
        }

        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 1) {
        // greenscreen a -> b. make color transparent
        if (distance(inputColor, color1) <= range * 0.01) {
            color = color2;
        } else {
            color = mix(color1, color2, mixAmt * 0.01);
        }

    } else if (blendMode == 2) {
        // greenscreen b-> a. make color transparent
        if (distance(inputColor, color2) <= range * 0.01) {
            color = color1;
        } else {
            color = mix(color2, color1, mixAmt * 0.01);
        }
    } else if (blendMode == 3) {
        // a -> b black
        float c = 1.0 - step(cut, desaturate(color2).r);
        color2 = mix(color1, vec3(0.0), c);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 4) {
        // a -> b color black
        vec3 c = 1.0 - step(cut, color2);
        color2 = mix(color1, vec3(0.0), c);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 5) {
        // a -> b hue
        float c = rgb2hsv(color2).r;
        color2 = mix(color1, color2, c * cut);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 6) {
        // a -> b saturation
        float c = rgb2hsv(color2).g;
        color2 = mix(color1, color2, c * cut);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 7) {
        // a -> b value
        float c = rgb2hsv(color2).b;
        color2 = mix(color1, color2, c * cut);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 8) {
        // b -> a black
        float c = 1.0 - step(cut, desaturate(color1).r);
        color1 = mix(color2, vec3(0.0), c);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 9) {
        // b -> a color black
        vec3 c = 1.0 - step(cut, color1);
        color1 = mix(color2, vec3(0.0), c);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 10) {
        // b -> a hue
        float c = rgb2hsv(color1).r;
        color1 = mix(color1, color2, c * cut);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 11) {
        // b -> a saturation
        float c = rgb2hsv(color1).g;
        color1 = mix(color1, color2, c * cut);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 12) {
        // b -> a value
        float c = rgb2hsv(color1).b;
        color1 = mix(color1, color2, c * cut);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 13) {
        // mix
        color2 = mix(color1, color2, cut);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 14) {
        // psychedelic
        vec3 c = step(cut, mix(color1, color2, 0.5));
        color2 = mix(color1, color2, c);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 15) {
        // psychedelic 2
        vec3 c1 = smoothstep(color1, vec3(cut), color2);
        vec3 c2 = smoothstep(color2, vec3(cut), color1);
        color = mix(c1.brg, c2.gbr, mixAmt * 0.01);
    }

    return color;
}


void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 color1 = texture(inputTex, st);
    vec4 color2 = texture(tex, st);

    color.rgb = blend(color1.rgb, color2.rgb);
    color.a = mix(color1.a, color2.a, mixAmt * 0.01);

    fragColor = color;
}
