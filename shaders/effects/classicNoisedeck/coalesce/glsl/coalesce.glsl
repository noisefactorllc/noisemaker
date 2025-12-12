#version 300 es

/*
 * Coalesce compositing shader.
 * Provides blend modes plus a refractive cloaking mix that cross-samples both synth inputs.
 * Mix parameters are remapped from UI ranges so the refractive offsets stay within texture bounds during layering.
 */


precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float time;
uniform float seed;
uniform int blendMode;
uniform float mixAmt;
uniform float refractAAmt;
uniform float refractBAmt;
uniform float refractADir;
uniform float refractBDir;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718


float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float blendOverlay(float a, float b) {
    return a < 0.5 ? (2.0 * a * b) : (1.0 - 2.0 * (1.0 - a) * (1.0 - b));
}

float blendSoftLight(float base, float blend) {
    return (blend<0.5)?(2.0*base*blend+base*base*(1.0-2.0*blend)):(sqrt(base)*(2.0*blend-1.0)+2.0*base*(1.0-blend));
}

vec4 cloak(vec2 st) {
    float m = map(mixAmt, -100.0, 100.0, 0.0, 1.0);
    float ra = map(refractAAmt, 0.0, 100.0, 0.0, 0.125);
    float rb = map(refractBAmt, 0.0, 100.0, 0.0, 0.125);

    vec4 leftColor = texture(inputTex, st);
    vec4 rightColor = texture(tex, st);

    // When the mixer is all the way to the left, we see left refracted by right
    vec2 leftUV = vec2(st);
    float rightLen = length(rightColor.rgb);
    leftUV.x += cos(rightLen * TAU) * ra;
    leftUV.y += sin(rightLen * TAU) * ra;

    vec4 leftRefracted = texture(inputTex, fract(leftUV));

    // When the mixer is all the way to the right, we see right refracted by left
    vec2 rightUV = vec2(st);
    float leftLen = length(leftColor.rgb);
    rightUV.x += cos(leftLen * TAU) * rb;
    rightUV.y += sin(leftLen * TAU) * rb;

    vec4 rightRefracted = texture(tex, fract(rightUV));

    // As the mixer approaches midpoint, mix the two refracted outputs using the same
    // logic as the "reflect" mode in coalesce.
    vec4 leftReflected = min(rightRefracted * rightColor / (1.0 - leftRefracted * leftColor), vec4(1.0));
    vec4 rightReflected = min(leftRefracted * leftColor / (1.0 - rightRefracted * rightColor), vec4(1.0));

    vec4 left = vec4(1.0);
    vec4 right = vec4(1.0);
    if (mixAmt < 0.0) {
        left = mix(leftRefracted, leftReflected, map(mixAmt, -100.0, 0.0, 0.0, 1.0));
        right = rightReflected;
    } else {
        left = leftReflected;
        right = mix(rightReflected, rightRefracted, map(mixAmt, 0.0, 100.0, 0.0, 1.0));
    }

    return mix(left, right, m);
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

vec3 blend(vec4 color1, vec4 color2, int mode, float factor) {
    // if only one noise is enabled, return that noise

    vec4 color;
    vec4 middle;

    float amt = map(mixAmt, -100.0, 100.0, 0.0, 1.0);

    vec4 a = vec4(1.0);
    vec4 b = vec4(1.0);
    if (mode >= 1000) {  // HSV blend modes
        a.rgb = rgb2hsv(color1.rgb);
        b.rgb = rgb2hsv(color2.rgb);
    }

    if (mode == 0) {
        // add
        middle = min(color1 + color2, 1.0);
    } else if (mode == 1) {
        // alpha
        if (mixAmt < 0.0) {
            return mix(color1,
                       color2 * vec4(1.0 - color1.a) + color1 * vec4(color1.a),
                       map(mixAmt, -100.0, 0.0, 0.0, 1.0)).rgb;
        } else {
            return mix(color1 * vec4(1.0 - color2.a) + color2 * vec4(color2.a),
                       color2,
                       map(mixAmt, 0.0, 100.0, 0.0, 1.0)).rgb;
        }
    } else if (mode == 2) {
        // color burn
        middle = (color2 == vec4(0.0)) ? color2 : max((1.0 - ((1.0 - color1) / color2)),  vec4(0.0));
    } else if (mode == 3) {
        // color dodge
        middle = (color2 == vec4(1.0)) ? color2 : min(color1 / (1.0 - color2), vec4(1.0));
    } else if (mode == 4) {
        // darken
        middle = min(color1, color2);
    } else if (mode == 5) {
        // difference
        middle = abs(color1 - color2);
    } else if (mode == 6) {
        // exclusion
        middle = color1 + color2 - 2.0 * color1 * color2;  
    } else if (mode == 7) {
        // glow
        middle = (color2 == vec4(1.0)) ? color2 : min(color1 * color1 / (1.0 - color2), vec4(1.0));
    } else if (mode == 8) {
        // hard light
        middle = vec4(blendOverlay(color2.r, color1.r), blendOverlay(color2.g, color1.g), blendOverlay(color2.b, color1.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 9) {
        // lighten
        middle = max(color1, color2);
    } else if (mode == 10) {
        // mix
        middle = mix(color1, color2, 0.5);
    } else if (mode == 11) {
        // multiply
        middle = color1 * color2;
    } else if (mode == 12) {
        // negation
        middle = vec4(1.0) - abs(vec4(1.0) - color1 - color2);
    } else if (mode == 13) {
        // overlay
        middle = vec4(blendOverlay(color1.r, color2.r), blendOverlay(color1.g, color2.g), blendOverlay(color1.b, color2.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 14) {
        // phoenix
        middle = min(color1, color2) - max(color1, color2) + vec4(1.0);
    } else if (mode == 15) {
        // reflect
        middle = (color1 == vec4(1.0)) ? color1 : min(color2 * color2 / (1.0 - color1), vec4(1.0));
    } else if (mode == 16) {
        // screen
        middle = 1.0 - ((1.0 - color1) * (1.0 - color2));
    } else if (mode == 17) {
        // soft light
        middle = vec4(blendSoftLight(color1.r, color2.r), blendSoftLight(color1.g, color2.g), blendSoftLight(color1.b, color2.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 18) {
        // subtract
        middle = max(color1 + color2 - 1.0, 0.0);
    } else if (mode == 1000) {
        // hue a->b
        middle.rgb = hsv2rgb(vec3(b.r, a.g, a.b));
    } else if (mode == 1001) {
        // hue b->a
        middle.rgb = hsv2rgb(vec3(a.r, b.g, b.b));
    } else if (mode == 1002) {
        // saturation a->b
        middle.rgb = hsv2rgb(vec3(a.r, b.g, a.b));
    } else if (mode == 1003) {
        // saturation b->a
        middle.rgb = hsv2rgb(vec3(b.r, a.g, b.b));
    } else if (mode == 1004) {
        // brightness a->b
        middle.rgb = hsv2rgb(vec3(a.r, a.g, b.b));
    } else if (mode == 1005) {
        // brightness b->a
        middle.rgb = hsv2rgb(vec3(b.r, b.g, a.b));
    }

    if (mode >= 1000) {  // Make sure HSV blend modes have alpha set
        middle.a = mix(color1.a, color2.a, 0.5);
    }

    if (factor == 0.5) {
        color = middle;
    } else if (factor < 0.5) {
        factor = map(amt, 0.0, 0.5, 0.0, 1.0);
        color = mix(color1, middle, factor);
    } else if (factor > 0.5) {
        factor = map(amt, 0.5, 1.0, 0.0, 1.0);
        color = mix(middle, color2, factor);
    }

    return color.rgb;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution;
    st.y = 1.0 - st.y;

    if (blendMode == 100) {
        color = cloak(st);
    } else {
        float ra = map(refractAAmt, 0.0, 100.0, 0.0, 0.125);
        float rb = map(refractBAmt, 0.0, 100.0, 0.0, 0.125);

        vec4 leftColor = texture(inputTex, st);
        vec4 rightColor = texture(tex, st);

        // refract a->b
        vec2 leftUV = vec2(st);
        float rightLen = length(rightColor.rgb) + refractADir / 360.0;
        leftUV.x += cos(rightLen * TAU) * ra;
        leftUV.y += sin(rightLen * TAU) * ra;
        
        //leftUV += refract(normalize(leftColor.rgb), normalize(rightColor.rgb), refractAAmt * 0.005).xz;

        // refract b->a
        vec2 rightUV = vec2(st);
        float leftLen = length(leftColor.rgb) + refractBDir / 360.0;
        rightUV.x += cos(leftLen * TAU) * rb;
        rightUV.y += sin(leftLen * TAU) * rb;

        //rightUV += refract(normalize(rightColor.rgb), normalize(leftColor.rgb), refractBAmt * 0.005).xz;

        vec4 color1 = texture(inputTex, leftUV);
        vec4 color2 = texture(tex, rightUV);

        color.rgb = blend(color1, color2, blendMode, mixAmt);
        color.a = max(color1.a, color2.a);
    }

    fragColor = color;
}
