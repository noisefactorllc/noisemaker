#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform int symmetry;
uniform float scale;
uniform float offsetX;
uniform float offsetY;
uniform float angle;
uniform float repeatCount;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

/*
 * Rotate a 2D point by radians.
 */
vec2 rot(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

/*
 * Mirror fold: maps [0,1] so that 0 and 1 have the same value.
 */
float mirrorFold(float t) {
    return 1.0 - abs(2.0 * fract(t * 0.5) - 1.0);
}

/*
 * Fold UV into a sector of angle 2*PI/n using polar coordinates.
 * The folded UV always lands in the first sector [0, PI/n].
 */
vec2 rotationalFold(vec2 uv, int n) {
    float fn = float(n);
    float sectorAngle = TAU / fn;

    // Center on origin
    vec2 p = uv - 0.5;

    // Convert to polar
    float a = atan(p.y, p.x);
    float r = length(p);

    // Normalize to [0, TAU] then fold into first sector
    a = mod(mod(a + TAU, TAU), sectorAngle);

    // Mirror within sector for seamless edges
    if (a > sectorAngle * 0.5) {
        a = sectorAngle - a;
    }

    // Back to cartesian, re-center
    return vec2(r * cos(a), r * sin(a)) + 0.5;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    // Apply tiling repetition
    vec2 st = uv * repeatCount;
    st = fract(st);

    // Apply source region transforms: offset, scale, rotation
    st = (st - 0.5) / scale;
    st = rot(st, angle * PI / 180.0);
    st += 0.5 + vec2(offsetX, offsetY);

    // Apply symmetry
    if (symmetry == 0) {
        // mirror-x
        st.x = mirrorFold(st.x);
        st.y = fract(st.y);
    } else if (symmetry == 1) {
        // mirror-xy
        st.x = mirrorFold(st.x);
        st.y = mirrorFold(st.y);
    } else if (symmetry == 2) {
        // rotate-2
        st = rotationalFold(fract(st), 2);
    } else if (symmetry == 3) {
        // rotate-3
        st = rotationalFold(fract(st), 3);
    } else if (symmetry == 4) {
        // rotate-4
        st = rotationalFold(fract(st), 4);
    } else {
        // rotate-6
        st = rotationalFold(fract(st), 6);
    }

    // Clamp to valid texture range
    st = clamp(st, 0.0, 1.0);

    fragColor = vec4(texture(inputTex, st).rgb, 1.0);
}
