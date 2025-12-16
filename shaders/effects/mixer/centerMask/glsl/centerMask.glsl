#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform int metric;
uniform float power;

out vec4 fragColor;

float clamp01(float x) {
    return clamp(x, 0.0, 1.0);
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
    // Remap power from -100..100 to 0.1..50
    float scaledPower = mix(0.1, 50.0, (power + 100.0) / 200.0);
    float mask = pow(dist01, scaledPower);

    vec4 color = mix(centerColor, edgeColor, mask);
    color.a = max(edgeColor.a, centerColor.a);

    fragColor = color;
}
