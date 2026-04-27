#version 300 es

/*
 * Prismatic aberration effect.
 * Ported from classicNoisedeck/lensDistortion.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform float aberrationAmt;
uniform float hueRotation;
uniform float hueRange;
uniform bool modulate;
uniform float saturation;
uniform float passthru;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

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

vec3 saturate(vec3 color) {
    float sat = map(saturation, -100.0, 100.0, -1.0, 1.0);
    float avg = (color.r + color.g + color.b) / 3.0;
    color -= (avg - color) * sat;
    return color;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);

    vec2 diff = vec2(0.5 * aspectRatio, 0.5) - vec2(uv.x * aspectRatio, uv.y);
    float centerDist = length(diff);

    // No distortion/zoom
    vec2 lensedCoords = uv;

    float aberrationOffset = map(aberrationAmt, 0.0, 100.0, 0.0, 0.05) * centerDist * PI * 0.5;

    float redOffset = mix(clamp(lensedCoords.x + aberrationOffset, 0.0, 1.0), lensedCoords.x, lensedCoords.x);
    vec4 red = texture(inputTex, vec2(redOffset, lensedCoords.y));

    vec4 green = texture(inputTex, lensedCoords);

    float blueOffset = mix(lensedCoords.x, clamp(lensedCoords.x - aberrationOffset, 0.0, 1.0), lensedCoords.x);
    vec4 blue = texture(inputTex, vec2(blueOffset, lensedCoords.y));

    // from aberration
    vec3 hsv = vec3(1.0);

    float t = modulate ? time : 0.0;

    // prismatic - get edges
    color = vec4(length(vec4(red.r, green.g, blue.b, color.a) - green)) * green;
    color.a = green.a;

    // boost hue range of edges
    hsv = rgb2hsv(color.rgb);
    hsv[0] = fract(((hsv[0] + 0.125 + (1.0 - (hueRotation / 360.0))) * (2.0 + hueRange * 0.05)) + t);
    hsv[1] = 1.0;

    // desaturate original
    green.rgb = saturate(green.rgb) * map(passthru, 0.0, 100.0, 0.0, 2.0);

    // recombine (add)
    color.rgb = min(green.rgb + hsv2rgb(hsv), 1.0);

    fragColor = color;
}
