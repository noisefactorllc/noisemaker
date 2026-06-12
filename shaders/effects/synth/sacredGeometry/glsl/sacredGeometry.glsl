#version 300 es
precision highp float;

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float aspect;
uniform float scale;
uniform float rotation;
uniform float thickness;
uniform float smoothness;
uniform int geometry;
uniform int rings;
uniform int starPoints;
uniform int animation;
uniform float speed;
uniform float pulseDepth;
uniform float time;
uniform vec3 fgColor;
uniform vec3 bgColor;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define SQRT3 1.7320508075688772

#define ANIM_ROTATE 1
#define ANIM_PULSE 2
#define ANIM_RIPPLE 4
#define ANIM_UNFOLD 5

#define GEOM_FLOWER 0
#define GEOM_FRUIT 1
#define GEOM_METATRON 3
#define GEOM_SEED 4
#define GEOM_VESICA 5
#define GEOM_BORROMEAN 6
#define GEOM_STARPOLYGON 7
#define GEOM_TRIQUETRA 8

vec2 rotate2D(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float lineSegmentSDF(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float outlineEdge(float d, float w) {
    return smoothstep(w + smoothness, w - smoothness, abs(d));
}

// Ripple: per-circle radius modulation with phase offset. Phase shifts cycle
// outward (or inward with negative speed). Used inside circle-based geometries.
float ripplePulse(float phase) {
    return 1.0 + pulseDepth * sin(time * TAU * floor(speed) - phase);
}

// Unfold: per-element visibility with seamless half-period bump. Element with
// appearance offset `t_e ∈ [0, 1]` peaks at time `0.25 + t_e * 0.5`. Loops cleanly.
float unfoldVis(float t_e) {
    return max(0.0, sin((time - t_e * 0.5) * TAU * floor(speed)));
}

// Flower / Seed of Life — overlapping circles on a hex grid out to `ringsN` shells.
float flowerMask(vec2 p, int ringsN, float figureScale) {
    float lineWidth = 0.04 + thickness * 0.12;
    float circleRadius = 1.0;
    p = p * figureScale;

    float m = 0.0;
    for (int q = -6; q <= 6; q++) {
        if (q < -ringsN || q > ringsN) continue;
        for (int r = -6; r <= 6; r++) {
            if (r < -ringsN || r > ringsN) continue;
            if (q + r < -ringsN || q + r > ringsN) continue;

            vec2 center = vec2(float(q) + float(r) * 0.5, float(r) * SQRT3 * 0.5);
            float hexDist = max(max(abs(float(q)), abs(float(r))), abs(float(q + r)));

            float circleR = circleRadius;
            if (animation == ANIM_RIPPLE) {
                circleR *= ripplePulse(hexDist * 1.4);
            }
            float d = length(p - center) - circleR;

            float vis = 1.0;
            if (animation == ANIM_UNFOLD) {
                float t_e = hexDist / max(float(ringsN), 1.0);
                vis = unfoldVis(t_e);
            }

            m = max(m, outlineEdge(d, lineWidth) * vis);
        }
    }
    return m;
}

// Fruit of Life — 13 tangent circles (1 center + 6 inner + 6 outer).
// When drawLines is true, also draw all C(13,2) = 78 connecting line segments
// (Metatron's Cube).
float fruitMask(vec2 p, bool drawLines) {
    float lineWidth = 0.04 + thickness * 0.12;
    p = p * 0.5;

    vec2 centers[13];
    centers[0] = vec2(0.0, 0.0);
    for (int k = 0; k < 6; k++) {
        float angle = float(k) * PI / 3.0;
        centers[1 + k] = 2.0 * vec2(cos(angle), sin(angle));
    }
    for (int k = 0; k < 6; k++) {
        float angle = float(k) * PI / 3.0 + PI / 6.0;
        centers[7 + k] = 2.0 * SQRT3 * vec2(cos(angle), sin(angle));
    }

    float maxCircleDist = 2.0 * SQRT3;  // outer ring
    // For metatron, circles unfold in the first 60% of the cycle, lines in the rest.
    float circleUnfoldRange = drawLines ? 0.6 : 1.0;

    float m = 0.0;

    for (int i = 0; i < 13; i++) {
        float distFromOrigin = length(centers[i]);

        float circleR = 1.0;
        if (animation == ANIM_RIPPLE) {
            circleR *= ripplePulse(distFromOrigin * 0.8);
        }
        float d = length(p - centers[i]) - circleR;

        float vis = 1.0;
        if (animation == ANIM_UNFOLD) {
            float t_e = distFromOrigin / maxCircleDist * circleUnfoldRange;
            vis = unfoldVis(t_e);
        }

        m = max(m, outlineEdge(d, lineWidth) * vis);
    }

    if (drawLines) {
        // Lines come second in the unfold sequence (t_e starting at 0.6).
        float lineVis = 1.0;
        if (animation == ANIM_UNFOLD) {
            lineVis = unfoldVis(0.65);
        }
        for (int i = 0; i < 13; i++) {
            for (int j = 0; j < 13; j++) {
                if (j <= i) continue;
                float dL = lineSegmentSDF(p, centers[i], centers[j]);
                m = max(m, outlineEdge(dL, lineWidth * 0.5) * lineVis);
            }
        }
    }

    return m;
}

// Vesica Piscis — two overlapping circles with centers separated by 1 radius.
float vesicaMask(vec2 p) {
    float lineWidth = 0.04 + thickness * 0.12;
    p = p * 0.25;
    float r = 1.5;
    float sep = r * 0.5;

    float rA = r;
    float rB = r;
    if (animation == ANIM_RIPPLE) {
        rA *= ripplePulse(0.0);
        rB *= ripplePulse(PI);  // 180° out of phase
    }

    float visA = 1.0;
    float visB = 1.0;
    if (animation == ANIM_UNFOLD) {
        visA = unfoldVis(0.0);
        visB = unfoldVis(0.5);
    }

    float dA = length(p - vec2(-sep, 0.0)) - rA;
    float dB = length(p - vec2( sep, 0.0)) - rB;

    float m = 0.0;
    m = max(m, outlineEdge(dA, lineWidth) * visA);
    m = max(m, outlineEdge(dB, lineWidth) * visB);
    return m;
}

// Triquetra — three pairwise vesica intersection outlines.
float triquetraMask(vec2 p) {
    float lineWidth = 0.04 + thickness * 0.12;
    p = p * 0.30;
    float r = 2.25;
    float dist = r / SQRT3;

    vec2 C0 = dist * vec2(cos(PI * 0.5),                   sin(PI * 0.5));
    vec2 C1 = dist * vec2(cos(PI * 0.5 + TAU / 3.0),       sin(PI * 0.5 + TAU / 3.0));
    vec2 C2 = dist * vec2(cos(PI * 0.5 + 2.0 * TAU / 3.0), sin(PI * 0.5 + 2.0 * TAU / 3.0));

    float r0 = r;
    float r1 = r;
    float r2 = r;
    if (animation == ANIM_RIPPLE) {
        r0 *= ripplePulse(0.0);
        r1 *= ripplePulse(TAU / 3.0);
        r2 *= ripplePulse(2.0 * TAU / 3.0);
    }

    float d0 = length(p - C0) - r0;
    float d1 = length(p - C1) - r1;
    float d2 = length(p - C2) - r2;

    float v01 = 1.0;
    float v02 = 1.0;
    float v12 = 1.0;
    if (animation == ANIM_UNFOLD) {
        v01 = unfoldVis(0.0);
        v02 = unfoldVis(0.33);
        v12 = unfoldVis(0.66);
    }

    float m = 0.0;
    m = max(m, outlineEdge(max(d0, d1), lineWidth) * v01);
    m = max(m, outlineEdge(max(d0, d2), lineWidth) * v02);
    m = max(m, outlineEdge(max(d1, d2), lineWidth) * v12);
    return m;
}

// Borromean Rings — three full circles arranged at 120°.
float borromeanMask(vec2 p) {
    float lineWidth = 0.04 + thickness * 0.12;
    p = p * 0.32;
    float r = 1.5;
    float dist = 1.4;

    float m = 0.0;
    for (int i = 0; i < 3; i++) {
        float angle = float(i) * TAU / 3.0 + PI * 0.5;
        vec2 c = dist * vec2(cos(angle), sin(angle));

        float circleR = r;
        if (animation == ANIM_RIPPLE) {
            circleR *= ripplePulse(float(i) * TAU / 3.0);
        }
        float d = length(p - c) - circleR;

        float vis = 1.0;
        if (animation == ANIM_UNFOLD) {
            vis = unfoldVis(float(i) / 3.0);
        }

        m = max(m, outlineEdge(d, lineWidth) * vis);
    }
    return m;
}

// Star Polygon {n/2} — n vertices, each connected to the vertex two positions away.
float starPolygonMask(vec2 p, int n) {
    float lineWidth = 0.04 + thickness * 0.12;
    p = p * 0.32;
    float radius = 2.8;

    if (animation == ANIM_RIPPLE) {
        radius *= ripplePulse(0.0);
    }

    float m = 0.0;
    for (int i = 0; i < 12; i++) {
        if (i >= n) break;
        int j = (i + 2) - ((i + 2) / n) * n;
        float angle1 = float(i) * TAU / float(n) + PI * 0.5;
        float angle2 = float(j) * TAU / float(n) + PI * 0.5;
        vec2 a = radius * vec2(cos(angle1), sin(angle1));
        vec2 b = radius * vec2(cos(angle2), sin(angle2));
        float dL = lineSegmentSDF(p, a, b);

        float vis = 1.0;
        if (animation == ANIM_UNFOLD) {
            vis = unfoldVis(float(i) / float(n));
        }

        m = max(m, outlineEdge(dL, lineWidth) * vis);
    }
    return m;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 st = globalCoord / fullResolution;
    st = (st - 0.5) * 2.0;
    st.x *= aspect;

    float rad = rotation * PI / 180.0;
    st = rotate2D(st, rad);

    if (animation == ANIM_ROTATE) {
        st = rotate2D(st, time * TAU * floor(speed));
    }

    float scaleFactor = 21.0 - scale;
    if (animation == ANIM_PULSE) {
        scaleFactor *= 1.0 + pulseDepth * sin(time * TAU * floor(speed));
    }

    vec2 p = st * scaleFactor;

    float m = 0.0;
    if (geometry == GEOM_FLOWER) {
        m = flowerMask(p, rings, 0.45);
    } else if (geometry == GEOM_SEED) {
        m = flowerMask(p, 1, 0.23);
    } else if (geometry == GEOM_FRUIT) {
        m = fruitMask(p, false);
    } else if (geometry == GEOM_METATRON) {
        m = fruitMask(p, true);
    } else if (geometry == GEOM_VESICA) {
        m = vesicaMask(p);
    } else if (geometry == GEOM_BORROMEAN) {
        m = borromeanMask(p);
    } else if (geometry == GEOM_TRIQUETRA) {
        m = triquetraMask(p);
    } else if (geometry == GEOM_STARPOLYGON) {
        m = starPolygonMask(p, starPoints);
    }

    m = clamp(m, 0.0, 1.0);
    vec3 color = mix(bgColor, fgColor, m);
    fragColor = vec4(color, 1.0);
}
