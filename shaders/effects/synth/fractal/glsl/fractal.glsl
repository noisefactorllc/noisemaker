/*
 * GLSL fractal explorer shader (mono-only variant).
 * Removed: palette colorization, hsv colorMode, all palette uniforms
 * Output: grayscale intensity based on escape iteration
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform float time;
uniform int seed;
uniform vec2 resolution;
uniform int fractalType;
uniform int symmetry;
uniform float offsetX;
uniform float offsetY;
uniform float centerX;
uniform float centerY;
uniform float zoomAmt;
uniform float speed;
uniform float rotation;
uniform int iterations;
uniform int mode;
uniform float levels;
uniform vec3 backgroundColor;
uniform float backgroundOpacity;
uniform float cutoff;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float aspectRatio;

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

// Newton fractal functions
vec2 fx(vec2 z) {
    vec2 xn = vec2(pow(z.x, 3.0) - 3.0 * z.x * pow(z.y, 2.0) - 1.0, 3.0 * pow(z.x, 2.0) * z.y - pow(z.y, 3.0));
    return xn;
}

vec2 fpx(vec2 z) {
    vec2 xn = vec2(3.0 * pow(z.x, 2.0) - 3.0 * pow(z.y, 2.0), 6.0 * z.x * z.y);
    return xn;
}

vec2 divide(vec2 z1, vec2 z2) {
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

    st.x += centerY * 0.01;
    st.y += centerX * 0.01;

    vec2 n = st;
    float iter = 0.0;
    vec2 tst;

    for (int i = 0; i < iterations; i++) {
        tst = divide(fx(n), fpx(n));
        tst += vec2(sin(time * TAU), cos(time * TAU)) * 0.1 * s;
        tst += vec2(offX, offY);

        if (length(tst) < 0.001)
            break;
        n = n - tst;
        iter += 1.0;
    }

    if (mode == 0) {
        return iter / float(iterations);
    } else if (mode == 1) {
        return length(n);
    }
    return 0.0;
}

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
    for (int i = 0; i < iterScaled; i++) {
        iter = i;
        float x = (z.x * z.x - z.y * z.y) + c.x;
        float y = (z.y * z.x + z.x * z.y) + c.y;

        if ((x * x + y * y) > 4.0) break;
        z.x = x;
        z.y = y;
    }

    if ((iterScaled - iter) < int(cutoff)) {
        return 1.0;
    }

    if (mode == 0) {
        return float(iter) / float(iterScaled);
    } else if (mode == 1) {
        return length(z);
    }
    return 0.0;
}

float mandelbrot(vec2 st) {
    float zoom = map(zoomAmt, 0.0, 100.0, 2.0, 0.5);
    float speedy = map(speed, 0.0, 100.0, 0.0, 1.0);
    float s = mix(speedy * 0.05, speedy * 0.125, speedy);

    st = rotate2D(st, rotation);
    st.y = st.y * 2.0 - 1.0;
    st.x = st.x * 2.0 - aspectRatio;

    vec2 z = vec2(0.0);
    vec2 c = zoom * st - vec2(centerX + 50.0, centerY) * 0.01;
    z += vec2(sin(time * TAU), cos(time * TAU)) * s;
    
    float i = 0.0;
    for (i = 0.0; i < float(iterations); i++) {
        z = mat2(z, -z.y, z.x) * z + c;

        if (dot(z, z) > 4.0 * 4.0) {
            break;
        }
    }

    if (i == float(iterations)) {
        return 1.0;
    }

    if (mode == 0) {
        return i / float(iterations);
    } else if (mode == 1) {
        return length(z) / float(iterations);
    }
    return 0.0;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution.y;
    aspectRatio = resolution.x / resolution.y;

    float d;
    if (fractalType == 0) {
        d = julia(st);
    } else if (fractalType == 1) {
        d = newton(st);
    } else {
        d = mandelbrot(st);
    }

    if (d == 1.0) {
        fragColor = vec4(backgroundColor, backgroundOpacity * 0.01);
        return;
    }

    d = fract(d);

    if (levels > 0.0) {
        float lev = levels + 1.0;
        d = floor(d * lev) / lev;
    }

    // Mono output: grayscale intensity
    color.rgb = vec3(d);

    fragColor = color;
}
