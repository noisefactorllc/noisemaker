#version 300 es

/*
 * Palette mapping shader.
 * Recolors the input feed by projecting luminance into configurable palette ramps.
 * Hue rotation and cycling values are normalized to prevent wrapping artifacts during automation.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform int seed;
uniform int paletteType;
uniform int cycle;
uniform float rotate;
// five color palettes
uniform bool smoother;
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 color3;
uniform vec3 color4;
uniform vec3 color5;
uniform vec3 tint;
// cosine palettes
uniform float offsetR;
uniform float offsetG;
uniform float offsetB;
uniform float phaseR;
uniform float phaseG;
uniform float phaseB;
uniform float ampR;
uniform float ampG;
uniform float ampB;
uniform float freq;
uniform int colorMode;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718


float luminance(vec3 color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

vec3 colorize(float v, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5) {
    v *= freq;
    v = mod(v, 1.0);

    // unsmooth pass
	vec3[5] colors = vec3[5](c1, c2, c3, c4, c5);
    vec3 color = colors[int(mod(v + 0.1, 1.0) * 5.0)];

    // smoothing pass
	float s = fwidth(v) * 0.75;
	if (s > 0.1) { s = 0.1; }
	if (v <= s || v >= 1.0 - s) {
		color = color1;
    } else if (v >= 0.1 - s && v <= 0.1 + s) {
        color = mix(color1, color2, smoothstep(0.1 - s, 0.1 + s, v));
    } else if (v >= 0.3 - s && v <= 0.3 + s) {
        color = mix(color2, color3, smoothstep(0.3 - s, 0.3 + s, v));
    } else if (v >= 0.5 - s && v <= 0.5 + s) {
        color = mix(color3, color4, smoothstep(0.5 - s, 0.5 + s, v));
    } else if (v >= 0.7 - s && v <= 0.7 + s) {
        color = mix(color4, color5, smoothstep(0.7 - s, 0.7 + s, v));
    } else if (v >= 0.9 - s && v <= 0.9 + s) {
        color = mix(color5, color1, smoothstep(0.9 - s, 0.9 + s, v));
    } 

    return color;
}

vec3 smoothColorize(float v, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5) {
    v *= freq;
	v = mod(v, 1.0);
    vec3 color = vec3(1.0);
    vec3[5] colors = vec3[5](c1, c2, c3, c4, c5);

	if (v <= 0.2) {
		color = mix(c1, c2, v * 5.0);
	} else if (v <= 0.4) {
		color = mix(c2, c3, (v - 0.2) * 5.0);
	} else if (v <= 0.6) {
		color = mix(c3, c4, (v - 0.4) * 5.0);
	} else if (v <= 0.8) {
		color = mix(c4, c5, (v - 0.6) * 5.0);
	} else {
        color = mix(c5, c1, (v - 0.8) * 5.0);
    }

    return color;
}

vec3 pal(float t) {
    t = fract(t + rotate * 0.01);
    vec3 a = vec3(offsetR, offsetG, offsetB) * 0.01;
    vec3 b = vec3(ampR, ampG, ampB) * 0.01;
    vec3 c = vec3(freq);
    vec3 d = vec3(phaseR, phaseG, phaseB) * 0.01;
 
    return a + b * cos(6.28318 * (c * t + d));

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

vec3 linearToSrgb(vec3 linear) {
    vec3 srgb;
    for (int i = 0; i < 3; ++i) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// oklab transform and inverse - Public Domain/MIT License
// https://bottosson.github.io/posts/oklab/

const mat3 fwdA = mat3(1.0, 1.0, 1.0,
                       0.3963377774, -0.1055613458, -0.0894841775,
                       0.2158037573, -0.0638541728, -1.2914855480);

const mat3 fwdB = mat3(4.0767245293, -1.2681437731, -0.0041119885,
                       -3.3072168827, 2.6093323231, -0.7034763098,
                       0.2307590544, -0.3411344290,  1.7068625689);

const mat3 invB = mat3(0.4121656120, 0.2118591070, 0.0883097947,
                       0.5362752080, 0.6807189584, 0.2818474174,
                       0.0514575653, 0.1074065790, 0.6302613616);

const mat3 invA = mat3(0.2104542553, 1.9779984951, 0.0259040371,
                       0.7936177850, -2.4285922050, 0.7827717662,
                       -0.0040720468, 0.4505937099, -0.8086757660);

vec3 oklab_from_linear_srgb(vec3 c) {
    vec3 lms = invB * c;

    return invA * (sign(lms)*pow(abs(lms), vec3(0.3333333333333)));
}

vec3 linear_srgb_from_oklab(vec3 c) {
    vec3 lms = fwdA * c;

    return fwdB * (lms * lms * lms);
}
// end oklab

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 color = texture(inputTex, uv);

    if (paletteType == 0) {
        float d = luminance(color.rgb) * 0.9; // prevent black and white from returning the same color
        if (cycle == -1) {
            color.rgb = pal(d + time);
        } else if (cycle == 1) { 
            color.rgb = pal(d - time);
        } else {
            color.rgb = pal(d);
        }

        if (colorMode == 0) {
            // hsv -> rgb conversion
            color.rgb = hsv2rgb(color.rgb);
        } else if (colorMode == 1) {
            // oklab -> rgb conversion
            color.g = color.g * -.509 + .276;
            color.b = color.b * -.509 + .198;
            color.rgb = linear_srgb_from_oklab(color.rgb);
            color.rgb = linearToSrgb(color.rgb);
        }
    } else if (paletteType == 1) {
        float l = luminance(color.rgb) + rotate * 0.01;

        if (smoother) {
            color.rgb = smoothColorize(l, color1, color2, color3, color4, color5);
        } else {
            color.rgb = colorize(l, color1, color2, color3, color4, color5);
        }

        color.rgb = mix(color.rgb, (color.rgb == vec3(1.0)) ? color.rgb : min(tint * tint / (1.0 - color.rgb), vec3(1.0)), 0.5);

        if (cycle == -1) {
            color.rgb = rgb2hsv(color.rgb);
            color.r = mod(color.r + time, 1.0);
            color.rgb = hsv2rgb(color.rgb);
        } else if (cycle == 1) {
            color.rgb = rgb2hsv(color.rgb);
            color.r = mod(color.r - time, 1.0);
            color.rgb = rgb2hsv(color.rgb);
        } 

    }

    fragColor = color;
}
