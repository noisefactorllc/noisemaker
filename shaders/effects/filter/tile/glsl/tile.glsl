#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform int symmetry;
uniform float scale;
uniform float offsetX;
uniform float offsetY;
uniform float angle;
uniform float repeat;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

/*
 * Rotate a 2D point around origin by radians.
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
 * Hex grid: returns local coordinates relative to the nearest hex center.
 * Two overlapping rectangular grids create alternating-row hex tiling.
 */
vec2 hexCoord(vec2 uv) {
    vec2 s = vec2(1.0, 1.7320508);  // (1, sqrt(3))
    vec2 h = s * 0.5;

    vec2 a = mod(uv, s) - h;
    vec2 b = mod(uv + h, s) - h;

    return (dot(a, a) < dot(b, b)) ? a : b;
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

    // Rotate the entire tiled grid (before fract so all tiles rotate together)
    vec2 st = rot(uv - 0.5, angle * PI / 180.0) + 0.5;

    if (symmetry == 3) {
        // Hex tiling with 6-fold rotational symmetry
        // hexCoord returns local coords centered at nearest hex center
        vec2 local = hexCoord(st * repeat);
        local = local / scale + vec2(offsetX, offsetY);
        st = rotationalFold(local + 0.5, 6);
    } else {
        // Square tiling
        st = st * repeat;
        st = fract(st);

        // Apply source region transforms (before fold — fold handles any input range)
        // mirrorXY needs half the range so edges match at default scale
        float effectiveScale = symmetry == 0 ? scale * 0.5 : scale;
        st = (st - 0.5) / effectiveScale;
        st += 0.5 + vec2(offsetX, offsetY);

        // Apply symmetry fold
        if (symmetry == 0) {
            // mirrorXY
            st.x = mirrorFold(st.x);
            st.y = mirrorFold(st.y);
        } else if (symmetry == 1) {
            // rotate2
            st = rotationalFold(fract(st), 2);
        } else {
            // rotate4
            st = rotationalFold(fract(st), 4);
        }
    }

    // Clamp to valid texture range
    st = clamp(st, 0.0, 1.0);

    fragColor = vec4(texture(inputTex, st).rgb, 1.0);
}
