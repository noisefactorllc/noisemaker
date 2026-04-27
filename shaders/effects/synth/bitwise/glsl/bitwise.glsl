#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float renderScale;
uniform float time;
uniform int operation;
uniform float scale;
uniform int offsetX;
uniform int offsetY;
uniform int mask;
uniform int seed;
uniform int colorMode;
uniform float speed;
uniform float rotation;
uniform int colorOffset;

out vec4 fragColor;

const float PI = 3.14159265358979;

// Branchless HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// Perform the selected bitwise/arithmetic operation on two integers,
// mask the result, then normalize to 0..1
float bitOp(int a, int b, int op, int m) {
    int r = 0;
    if (op == 0)      r = a ^ b;           // xor
    else if (op == 1) r = a & b;           // and
    else if (op == 2) r = a | b;           // or
    else if (op == 3) r = ~(a & b);        // nand
    else if (op == 4) r = ~(a ^ b);        // xnor
    else if (op == 5) r = a * b;           // mul
    else if (op == 6) r = a + b;           // add
    else              r = a - b;           // sub
    r = r & m;
    return float(r) / float(m);
}

void main() {
    // Map scale so higher value = bigger cells (lower frequency).
    // Multiply by renderScale so pixel-sized cells scale with export resolution.
    float pixelScale = scale * 0.1 * renderScale;

    // Apply rotation around screen center
    float angle = rotation * PI / 180.0;
    float c = cos(angle);
    float s = sin(angle);
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 centered = globalCoord - fullResolution * 0.5;
    vec2 rotated = vec2(centered.x * c - centered.y * s, centered.x * s + centered.y * c);
    vec2 coord = rotated + fullResolution * 0.5;

    // Time offset — uses 256 (pattern period) so it loops seamlessly at any speed
    int animOffset = int(floor(time * float(int(-speed)) * 256.0));

    // Compute integer coordinates
    int x = int(floor(coord.x / pixelScale)) + offsetX + animOffset;
    int y = int(floor(coord.y / pixelScale)) + offsetY;

    // Seed XORs into coordinates (dramatic pattern shifts)
    x = x ^ seed;
    y = y ^ (seed * 3);

    float v;
    if (colorMode == 0) {
        // Mono: same operation across all channels
        v = bitOp(x, y, operation, mask);
        fragColor = vec4(v, v, v, 1.0);
    } else if (colorMode == 1) {
        // RGB: channel-shifted patterns (chromatic aberration)
        float r = bitOp(x, y, operation, mask);
        float g = bitOp(x + colorOffset, y, operation, mask);
        float b = bitOp(x, y + colorOffset, operation, mask);
        fragColor = vec4(r, g, b, 1.0);
    } else {
        // HSV: bitwise value drives hue, full saturation and value
        // Scale hue to avoid wrapping both ends to red
        v = bitOp(x, y, operation, mask);
        float hueScale = float(mask) / float(mask + 1);
        fragColor = vec4(hsv2rgb(vec3(v * hueScale, 1.0, 1.0)), 1.0);
    }
}
