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
uniform int symmetry;
uniform int layers;
uniform int shape;
uniform float layerSpacing;
uniform float twist;
uniform float shapeGrowth;
uniform bool bindu;
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

#define SHAPE_PETAL 0
#define SHAPE_TRIANGLE 1
#define SHAPE_DOT 2

#define ANIM_ROTATE 1
#define ANIM_PULSE 2
#define ANIM_DIFFERENTIAL 3
#define ANIM_COUNTERROTATE 4
#define ANIM_SPIRALWAVE 5
#define ANIM_RIPPLE 6

vec2 rotate2D(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// Equilateral triangle SDF, tip pointing up (+y), centered at origin
float sdEquilateralTriangle(vec2 p, float r) {
    const float k = SQRT3;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) {
        p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    }
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

float fillEdge(float d) {
    return smoothstep(smoothness, -smoothness, d);
}

float mandalaMask(vec2 p) {
    float r = length(p);
    // Offset by -PI/2 so the first petal sits on the +y axis (screen up) at rotation=0.
    float theta = atan(p.y, p.x) - PI * 0.5;
    float wedge = TAU / float(symmetry);
    float twistRad = twist * PI / 180.0;
    float baseSize = 0.25 + thickness * 0.65;

    // spiralWave: twist amplitude oscillates over the cycle, so the spiral
    // tightens, unwinds, reverses, and returns. Uses `twist` as amplitude.
    float dynTwistRad = twistRad;
    if (animation == ANIM_SPIRALWAVE) {
        dynTwistRad = twistRad * sin(time * TAU * floor(speed));
    }

    float m = 0.0;

    // Bindu (center dot)
    if (bindu) {
        float dBindu = length(p) - (0.15 + thickness * 0.15);
        m = max(m, fillEdge(dBindu));
    }

    for (int i = 0; i < 12; i++) {
        if (i >= layers) break;
        float Rlayer = float(i + 1) * layerSpacing;

        // Per-layer animation rotation (in addition to static twist).
        // differential: layer i rotates at (speed + i) turns/cycle.
        // counterRotate: even layers forward, odd layers reverse.
        float layerAnimRot = 0.0;
        if (animation == ANIM_DIFFERENTIAL) {
            layerAnimRot = time * TAU * (floor(speed) + float(i));
        } else if (animation == ANIM_COUNTERROTATE) {
            float dir = (mod(float(i), 2.0) < 0.5) ? 1.0 : -1.0;
            layerAnimRot = time * TAU * floor(speed) * dir;
        }

        float layerTheta = theta - float(i) * dynTwistRad - layerAnimRot;
        float folded = abs(mod(layerTheta + wedge * 0.5, wedge) - wedge * 0.5);
        float radial = r - Rlayer;
        float tangent = folded * Rlayer;

        // Per-layer shape size: linear ramp across layers from -growth/2 to +growth/2.
        float lt = 0.0;
        if (layers > 1) {
            lt = float(i) / float(layers - 1) - 0.5;
        }
        float shapeSize = baseSize * (1.0 + shapeGrowth * lt);

        // ripple: per-layer pulse with phase offset → wave traveling outward.
        if (animation == ANIM_RIPPLE) {
            shapeSize *= 1.0 + pulseDepth * sin(time * TAU * floor(speed) - float(i) * 0.6);
        }

        if (shape == SHAPE_PETAL) {
            // Elongated radially: squeeze the radial axis
            float d = length(vec2(radial * 0.55, tangent)) - shapeSize;
            m = max(m, fillEdge(d));
        } else if (shape == SHAPE_TRIANGLE) {
            // Triangle pointing outward radially. Local frame: y=radial outward, x=tangent
            vec2 q = vec2(tangent, -radial);
            float d = sdEquilateralTriangle(q, shapeSize);
            m = max(m, fillEdge(d));
        } else {
            // Dot
            float d = length(vec2(radial, tangent)) - shapeSize * 0.7;
            m = max(m, fillEdge(d));
        }
    }
    return m;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 st = globalCoord / fullResolution;
    st = (st - 0.5) * 2.0;
    st.x *= aspect;

    // Static rotation
    float rad = rotation * PI / 180.0;
    st = rotate2D(st, rad);

    // Animation: rotate applies a time-dependent rotation. Integer turns at time=1 → seamless.
    if (animation == ANIM_ROTATE) {
        st = rotate2D(st, time * TAU * floor(speed));
    }

    // Animation: pulse modulates the effective scale via sin. Seamless on [0,1] for integer speed.
    float scaleFactor = 21.0 - scale;
    if (animation == ANIM_PULSE) {
        scaleFactor *= 1.0 + pulseDepth * sin(time * TAU * floor(speed));
    }

    vec2 p = st * scaleFactor;

    float m = clamp(mandalaMask(p), 0.0, 1.0);
    vec3 color = mix(bgColor, fgColor, m);
    fragColor = vec4(color, 1.0);
}
