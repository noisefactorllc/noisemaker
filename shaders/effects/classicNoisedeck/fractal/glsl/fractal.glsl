#version 300 es

/*
 * Fractal explorer shader.
 * Renders Mandelbrot and Julia sets with high precision iterations tuned for live zooming.
 * Escape radius and zoom parameters are clamped to keep iteration counts stable on stage hardware.
 */

precision highp float;
precision highp int;

uniform float time;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int type;
uniform int symmetry; // 2 3 4 5
uniform float offsetX;
uniform float offsetY;
uniform float centerX;
uniform float centerY;
uniform float zoomAmt;
uniform float speed;
uniform float rotation;
uniform int iterations;
uniform int mode;
uniform int colorMode;
uniform int paletteMode;
uniform vec3 paletteOffset;
uniform vec3 paletteAmp;
uniform vec3 paletteFreq;
uniform vec3 palettePhase;
uniform int cyclePalette;
uniform float rotatePalette;
uniform float repeatPalette;
uniform float hueRange;
uniform float levels;
uniform vec3 bgColor;
uniform float bgAlpha;
uniform float cutoff;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio fullResolution.x / fullResolution.y


float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

vec2 rotate2D(vec2 st, float rot) {
    rot = map(rot, 0.0, 360.0, 0.0, 2.0);
    float angle = rot * PI;
    st -= vec2(0.5 * aspectRatio, 0.5);
    st = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * st;
    st += vec2(0.5 * aspectRatio, 0.5);
    return st;
}

float offset(vec2 st) {
    return distance(st, vec2(0.5)) * 0.25;
}

float periodicFunction(float p) {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
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

vec3 pal(float t) {
    vec3 a = paletteOffset;
    vec3 b = paletteAmp;
    vec3 c = paletteFreq;
    vec3 d = palettePhase;

    //t = abs(t) + rotatePalette * 0.01;

    vec3 color = a + b * cos(6.28318 * (c * t + d));

    // convert to rgb if palette is in hsv or oklab mode
    // 1 = hsv, 2 = oklab, 3 = rgb
    if (paletteMode == 1) {
        color = hsv2rgb(color);
    } else if (paletteMode == 2) {
        color.g = color.g * -.509 + .276;
        color.b = color.b * -.509 + .198;
        color = linear_srgb_from_oklab(color);
        color = linearToSrgb(color);
    } 

    return color;
}

// Newton - MIT License
// from https://github.com/rupak10987/Shaders/blob/main/shader_files/newton%20fractal%20p3.frag
vec2 fx(vec2 z) {
    vec2 xn = vec2(pow(z.x, 3.0) - 3.0 * z.x * pow(z.y, 2.0) - 1.0, 3.0 * pow(z.x, 2.0) * z.y - pow(z.y, 3.0));
    return xn;
}

vec2 fpx(vec2 z) {
    vec2 xn = vec2(3.0 * pow(z.x, 2.0) - 3.0 * pow(z.y, 2.0), 6.0 * z.x * z.y);
    return xn;
}

vec2 divide(vec2 z1,vec2 z2) {
    vec2 result;
    result.x = (z1.x * z2.x + z1.y * z2.y) / (pow(z2.x, 2.0) + pow(z2.y, 2.0));
    result.y = (z1.y * z2.x - z1.x * z2.y) / (pow(z2.x, 2.0) + pow(z2.y, 2.0));
    return result;
}

float newton(vec2 st) {
    st = rotate2D(st, rotation + 90.0);
    st -= vec2(0.5 * aspectRatio, 0.5);
    st *= map(zoomAmt, 0.0, 130.0, 1.0, 0.01);

    float s = map(speed, 0.0, 100.0, 0.0, 1.0);
    float offX = map(offsetX, -100.0, 100.0, -0.25, 0.25);
    float offY = map(offsetY, -100.0, 100.0, -0.25, 0.25);

    st.x += centerY * 0.01; // centerX and centerY are switched due to rotation
    st.y += centerX * 0.01;

    vec2 n = st;
    float iter = 0.0;
    vec2 tst;

    for (int i = 0; i < iterations; i++) { // was 30
        tst = divide(fx(n), fpx(n));

        // animation experiments
        tst += vec2(sin(time * TAU), cos(time * TAU)) * 0.1 * s;
        tst += vec2(offX, offY);

        if (length(tst) < 0.001)
        break;
        n = n - tst;
        iter += 1.0;
    }

    if (mode == 0) {
        return iter / float(iterations);//30.0;
    } else if (mode == 1) {
        return length(n);
    }
}
// end newton

// Julia - Public Domain
// from http://nuclear.mutantstargoat.com/articles/sdr_fract/
float julia(vec2 st) {
    
    float zoom = map(zoomAmt, 0.0, 100.0, 2.0, 0.5);
    vec2 z;
    float speedy = map(speed, 0.0, 100.0, 0.0, 1.0);
    float s = mix(speedy * 0.05, speedy * 0.125, speedy);
    float _offsetX = map(offsetX, -100.0, 100.0, -0.5, 0.5);
    float _offsetY = map(offsetY, -100.0, 100.0, -1.0, 1.0);
    vec2 c = vec2(sin(time * TAU) * s + _offsetX, cos(time * TAU) * s + _offsetY);

    st = rotate2D(st, rotation);
    st = (st - vec2(0.5 * aspectRatio, 0.5)) * zoom;

    z.x = st.x + map(centerX, -100.0, 100.0, 1.0, -1.0);
    z.y = st.y + map(centerY, -100.0, 100.0, 1.0, -1.0);

    int iter;
    int iterScaled = iterations * 2;
    for (int i=0; i<iterScaled; i++) { // was 100
        iter = i;
        float x = (z.x * z.x - z.y * z.y) + c.x;
        float y = (z.y * z.x + z.x * z.y) + c.y;

        if((x * x + y * y) > 4.0) break;
        z.x = x;
        z.y = y;
    }


    if ((iterScaled - iter) < int(cutoff)) {
        return 1.0;
    }

    if (mode == 0) {
        return float(iter) / float(iterScaled);//100.0;
    } else if (mode == 1) {

        return length(z);
    }
}
// end julia

// Mandelbrot - MIT License
// modified from https://github.com/darkeclipz/fractals
float mandelbrot(vec2 st) {
    float zoom = map(zoomAmt, 0.0, 100.0, 2.0, 0.5);
    float speedy = map(speed, 0.0, 100.0, 0.0, 1.0);
    float s = mix(speedy * 0.05, speedy * 0.125, speedy);

    st = rotate2D(st, rotation);
    st.y = st.y * 2.0 - 1.0;
    st.x = st.x * 2.0 - aspectRatio;

    vec2 z = vec2(0.0);
    vec2 c = zoom * st - vec2(centerX + 50.0, centerY) * 0.01;
    z += vec2(sin(time * TAU), cos(time * TAU)) * s; // animate
    
    float i = 0.0;
    for (i = 0.0; i < float(iterations); i++) { // was 64
        //z.x += map(offsetX, -100.0, 100.0, -1.0, 1.0);
        //z.y += map(offsetY, -100.0, 100.0, -1.0, 1.0);

        z = mat2(z, -z.y, z.x) * z + c;

        if (dot(z, z) > 4.0 * 4.0) {
            break;
        }
    }

    if (i == float(iterations)) { // was 64
        //i = 0.0;
        return 1.0;
    }

    if (mode == 0) {
        return i/float(iterations);//64.0;
    } else if (mode == 1) {
        return length(z) / float(iterations);
    }
}
// end mandelbrot

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = globalCoord / fullResolution.y;

    float blend = periodicFunction(time - offset(st));

    float d;
    if (type == 0) {
        d = julia(st);
    } else if (type == 1) {
        d = newton(st);
    } else {
        d = mandelbrot(st);
    }

    if (d == 1.0) {
        fragColor = vec4(bgColor, bgAlpha * 0.01);
        return;
    }

    if (cyclePalette == -1) {
        d -= time;
    } else if (cyclePalette == 1) {
        d += time;
    }

    d = d * repeatPalette + rotatePalette * 0.01;
    d = fract(d);

    if (levels > 0.0) {
        float lev = levels + 1.0;
        d = floor(d * lev) / lev;
    }

    if (colorMode == 0) {
        // grayscale
        color.rgb = vec3(fract(d));
    } else if (colorMode == 4) {
        // palette
        color.rgb = pal(d);
    } else if (colorMode == 6) {
        // hsv
        d *= (hueRange * 0.01);
        color.rgb = hsv2rgb(vec3(d, 1.0, 1.0));
    }


    

    st = globalCoord / fullResolution;

    fragColor = color;
}
