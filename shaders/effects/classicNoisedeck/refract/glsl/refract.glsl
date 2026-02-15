#version 300 es

/*
 * Refract shader.
 * Applies noise-based UV perturbations to refract the input feed.
 * Scale and strength controls are normalized relative to resolution to prevent tearing.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform int seed;
uniform int mode;
uniform float amount;
uniform float refractDir;
uniform int blendMode;
uniform float mixAmt;
uniform int wrap;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718


float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

vec3 convolve(vec2 uv, float kernel[9], bool divide) {
    vec2 steps = 1.0 / resolution; // 1.0 / width = 1 texel
    vec2 offset[9];
    offset[0] = vec2(-steps.x, -steps.y);     // top left
    offset[1] = vec2(0.0, -steps.y);         // top middle
    offset[2] = vec2(steps.x, -steps.y);     // top right
    offset[3] = vec2(-steps.x, 0.0);         // middle left
    offset[4] = vec2(0.0, 0.0);             //middle
    offset[5] = vec2(steps.x, 0.0);            //middle right
    offset[6] = vec2(-steps.x, steps.y);     //bottom left
    offset[7] = vec2(0.0, steps.y);         //bottom middle
    offset[8] = vec2(steps.x, steps.y);     //bottom right

    float kernelWeight = 0.0;
    vec3 conv = vec3(0.0);

    for(int i = 0; i < 9; i++){
        //sample a 3x3 grid of pixels
        vec3 color = texture(inputTex, uv + offset[i] * floor(map(amount, 0.0, 100.0, 0.0, 20.0))).rgb;

        // multiply the color by the kernel value and add it to our conv total
        conv += color * kernel[i];

        // keep a running tally of the kernel weights
        kernelWeight += kernel[i];
    }

    // normalize the convolution by dividing by the kernel weight
    if (divide) {
        conv.rgb /= kernelWeight;
    }

    return clamp(conv.rgb, 0.0, 1.0);
}

float desaturate(vec3 color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

vec3 derivX(vec3 color, vec2 uv, bool divide) {
    // use: desaturate, get deriv_x and deriv_y and calculate dist between, then multiply by color
    vec3 dcolor = vec3(desaturate(color));

    float deriv_x[9];
    deriv_x[0] = 0.0; deriv_x[1] = 0.0; deriv_x[2] = 0.0;
    deriv_x[3] = 0.0; deriv_x[4] = 1.0; deriv_x[5] = -1.0;
    deriv_x[6] = 0.0; deriv_x[7] = 0.0; deriv_x[8] = 0.0;

    vec3 s1 = convolve(uv, deriv_x, divide);

    return s1;
}

vec3 derivY(vec3 color, vec2 uv, bool divide) {
    // use: desaturate, get deriv_x and deriv_y and calculate dist between, then multiply by color
    vec3 dcolor = vec3(desaturate(color));

    float deriv_y[9];
    deriv_y[0] = 0.0; deriv_y[1] = 0.0; deriv_y[2] = 0.0;
    deriv_y[3] = 0.0; deriv_y[4] = 1.0; deriv_y[5] = 0.0;
    deriv_y[6] = 0.0; deriv_y[7] = -1.0; deriv_y[8] = 0.0;

    vec3 s2 = convolve(uv, deriv_y, divide);
    return s2;
}

float periodicFunction(float p) {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

float blendOverlay(float a, float b) {
    return a < 0.5 ? (2.0 * a * b) : (1.0 - 2.0 * (1.0 - a) * (1.0 - b));
}

float blendSoftLight(float base, float blend) {
    return (blend<0.5)?(2.0*base*blend+base*base*(1.0-2.0*blend)):(sqrt(base)*(2.0*blend-1.0)+2.0*base*(1.0-blend));
}

vec3 blend(vec4 color1, vec4 color2) {
    // if only one noise is enabled, return that noise

    vec4 color;
    vec4 middle;

    float amt = map(mixAmt, 0.0, 100.0, 0.0, 1.0);

    if (blendMode == 0) {
        // add
        middle = min(color1 + color2, 1.0);
    } else if (blendMode == 2) {
        // color burn
        middle = (color2 == vec4(0.0)) ? color2 : max((1.0 - ((1.0 - color1) / color2)),  vec4(0.0));
    } else if (blendMode == 3) {
        // color dodge
        middle = (color2 == vec4(1.0)) ? color2 : min(color1 / (1.0 - color2), vec4(1.0));
    } else if (blendMode == 4) {
        // darken
        middle = min(color1, color2);
    } else if (blendMode == 5) {
        // difference
        middle = abs(color1 - color2);
    } else if (blendMode == 6) {
        // exclusion
        middle = color1 + color2 - 2.0 * color1 * color2;
    } else if (blendMode == 7) {
        // glow
        middle = (color2 == vec4(1.0)) ? color2 : min(color1 * color1 / (1.0 - color2), vec4(1.0));
    } else if (blendMode == 8) {
        // hard light
        middle = vec4(blendOverlay(color2.r, color1.r), blendOverlay(color2.g, color1.g), blendOverlay(color2.b, color1.b), mix(color1.a, color2.a, 0.5));
    } else if (blendMode == 9) {
        // lighten
        middle = max(color1, color2);
    } else if (blendMode == 10) {
        // mix
        middle = mix(color1, color2, 0.5);
    } else if (blendMode == 11) {
        // multiply
        middle = color1 * color2;
    } else if (blendMode == 12) {
        // negation
        middle = vec4(1.0) - abs(vec4(1.0) - color1 - color2);
    } else if (blendMode == 13) {
        // overlay
        middle = vec4(blendOverlay(color1.r, color2.r), blendOverlay(color1.g, color2.g), blendOverlay(color1.b, color2.b), mix(color1.a, color2.a, 0.5));
    } else if (blendMode == 14) {
        // phoenix
        middle = min(color1, color2) - max(color1, color2) + vec4(1.0);
    } else if (blendMode == 15) {
        // reflect
        middle = (color1 == vec4(1.0)) ? color1 : min(color2 * color2 / (1.0 - color1), vec4(1.0));
    } else if (blendMode == 16) {
        // screen
        middle = 1.0 - ((1.0 - color1) * (1.0 - color2));
    } else if (blendMode == 17) {
        // soft light
        middle = vec4(blendSoftLight(color1.r, color2.r), blendSoftLight(color1.g, color2.g), blendSoftLight(color1.b, color2.b), mix(color1.a, color2.a, 0.5));
    } else if (blendMode == 18) {
        // subtract
        middle = max(color1 + color2 - 1.0, 0.0);
    }

    if (amt == 0.5) {
        color = middle;
    } else if (amt < 0.5) {
        amt = map(amt, 0.0, 0.5, 0.0, 1.0);
        color = mix(color1, middle, amt);
    } else if (amt > 0.5) {
        amt = map(amt, 0.5, 1.0, 0.0, 1.0);
        color = mix(middle, color2, amt);
    }

    return color.rgb;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 color = vec4(0.0);

    vec4 inputColor = texture(inputTex, uv);
    float brightness = desaturate(inputColor.rgb) + refractDir / 360.0;

    if (mode == 0) {
        uv.x += cos(brightness * TAU) * amount * 0.01;
        uv.y += sin(brightness * TAU) * amount * 0.01;

        //color = texture(inputTex, fract(uv));
    } else if (mode == 1) {
        uv.y += desaturate(derivX(inputColor.rgb, uv, false)) * amount * 0.01;
        uv.x += desaturate(derivY(inputColor.rgb, uv, false)) * amount * 0.01;

        //color = texture(inputTex, fract(uv));
    }

    if (wrap == 0) {
        // mirror (default)
        uv = uv;
    } else if (wrap == 1) {
        // repeat
        uv = mod(uv, 1.0);
    } else if (wrap == 2) {
        // clamp
        uv = clamp(uv, 0.0, 1.0);
    }

    color = texture(inputTex, uv);

    color.rgb = blend(inputColor, color);

    fragColor = color;
}
