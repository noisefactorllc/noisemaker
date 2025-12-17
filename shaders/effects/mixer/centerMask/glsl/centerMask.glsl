#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform int metric;
uniform float power;
uniform float hardness;
uniform int blendMode;

out vec4 fragColor;

float clamp01(float x) {
    return clamp(x, 0.0, 1.0);
}

float blendOverlay(float a, float b) {
    return a < 0.5 ? (2.0 * a * b) : (1.0 - 2.0 * (1.0 - a) * (1.0 - b));
}

float blendSoftLight(float base, float blend) {
    return (blend < 0.5)
        ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend))
        : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
}

vec4 applyBlendMode(vec4 color1, vec4 color2, int m) {
    // 0: add, 1: burn, 2: darken, 3: diff, 4: dodge, 5: exclusion,
    // 6: hardLight, 7: lighten, 8: mix, 9: multiply, 10: negation,
    // 11: overlay, 12: phoenix, 13: screen, 14: softLight, 15: subtract

    if (m == 0) {
        // add
        return min(color1 + color2, vec4(1.0));
    }
    if (m == 1) {
        // burn
        return 1.0 - min((1.0 - color1) / max(color2, vec4(0.001)), vec4(1.0));
    }
    if (m == 2) {
        // darken
        return min(color1, color2);
    }
    if (m == 3) {
        // diff
        return abs(color1 - color2);
    }
    if (m == 4) {
        // dodge
        return min(color1 / max(1.0 - color2, vec4(0.001)), vec4(1.0));
    }
    if (m == 5) {
        // exclusion
        return color1 + color2 - 2.0 * color1 * color2;
    }
    if (m == 6) {
        // hardLight (overlay with swapped args)
        return vec4(
            blendOverlay(color2.r, color1.r),
            blendOverlay(color2.g, color1.g),
            blendOverlay(color2.b, color1.b),
            1.0
        );
    }
    if (m == 7) {
        // lighten
        return max(color1, color2);
    }
    if (m == 8) {
        // mix (average)
        return (color1 + color2) * 0.5;
    }
    if (m == 9) {
        // multiply
        return color1 * color2;
    }
    if (m == 10) {
        // negation
        return vec4(1.0) - abs(vec4(1.0) - color1 - color2);
    }
    if (m == 11) {
        // overlay
        return vec4(
            blendOverlay(color1.r, color2.r),
            blendOverlay(color1.g, color2.g),
            blendOverlay(color1.b, color2.b),
            1.0
        );
    }
    if (m == 12) {
        // phoenix
        return min(color1, color2) - max(color1, color2) + vec4(1.0);
    }
    if (m == 13) {
        // screen
        return vec4(1.0) - (vec4(1.0) - color1) * (vec4(1.0) - color2);
    }
    if (m == 14) {
        // softLight
        return vec4(
            blendSoftLight(color1.r, color2.r),
            blendSoftLight(color1.g, color2.g),
            blendSoftLight(color1.b, color2.b),
            1.0
        );
    }
    // 15: subtract
    return max(color1 - color2, vec4(0.0));
}

float distanceMetric(vec2 p, vec2 corner, int m) {
    int mm = m % 3;
    if (mm < 0) {
        mm += 3;
    }
    vec2 ap = abs(p);

    // 0: euclidean, 1: manhattan, 2: chebyshev
    if (mm == 0) {
        float d = length(ap);
        float maxD = length(corner);
        return d / maxD;
    }

    if (mm == 1) {
        float d = ap.x + ap.y;
        float maxD = corner.x + corner.y;
        return d / maxD;
    }

    float d = max(ap.x, ap.y);
    float maxD = max(corner.x, corner.y);
    return d / maxD;
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 edgeColor = texture(inputTex, st);
    vec4 centerColor = texture(tex, st);

    float minRes = min(resolution.x, resolution.y);

    // Centered, aspect-correct position:
    // corner is the maximum |p| at the image corners.
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / (0.5 * minRes);
    vec2 corner = resolution / minRes;

    float dist01 = clamp01(distanceMetric(p, corner, metric));
    // Remap power from -100..100 to 0.1..25.05 (Old 0 maps to New 100)
    float scaledPower = mix(0.1, 25.05, (power + 100.0) / 200.0);
    float mask = pow(dist01, scaledPower);

    // Apply hardness
    float h = clamp(hardness / 100.0, 0.0, 0.995);
    float width = (1.0 - h) * 0.5;
    mask = smoothstep(0.5 - width, 0.5 + width, mask);

    // Edge fading:
    // power < -95: fade to edgeColor (mask=1)
    // power > 95: fade to centerColor (mask=0)
    float f_low = clamp((power + 100.0) / 5.0, 0.0, 1.0);
    float f_high = clamp((100.0 - power) / 5.0, 0.0, 1.0);

    mask = mix(1.0, mask, f_low);
    mask = mask * f_high;

    // Apply blend mode between center and edge colors
    vec4 blended = applyBlendMode(centerColor, edgeColor, blendMode);
    vec4 color = mix(centerColor, blended, mask);
    color.a = max(edgeColor.a, centerColor.a);

    fragColor = color;
}
