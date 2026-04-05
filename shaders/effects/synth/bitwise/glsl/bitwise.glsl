#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
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
    // Map scale so higher value = bigger cells (lower frequency)
    float pixelScale = scale * 0.1;

    // Apply rotation around screen center
    float angle = rotation * PI / 180.0;
    float c = cos(angle);
    float s = sin(angle);
    vec2 centered = gl_FragCoord.xy - resolution * 0.5;
    vec2 rotated = vec2(centered.x * c - centered.y * s, centered.x * s + centered.y * c);
    vec2 coord = rotated + resolution * 0.5;

    // Compute integer coordinates
    int x = int(floor(coord.x / pixelScale)) + offsetX;
    int y = int(floor(coord.y / pixelScale)) + offsetY;

    // Seed XORs into coordinates (dramatic pattern shifts)
    x = x ^ seed;
    y = y ^ (seed * 3);

    // Animate mask: ping-pong through 8 bit-depth values, loops seamlessly
    // speed controls how many complete ping-pongs per loop
    int animMask = mask;
    int spd = int(speed);
    if (spd != 0) {
        // 0→1 triangle wave, then scale to 0..7 integer steps
        float t = fract(time * float(spd));
        float tri = 1.0 - abs(t * 2.0 - 1.0);
        int step = int(floor(tri * 7.999));
        // Masks: 255, 127, 63, 31, 15, 7, 3, 1 (descending bit depth)
        animMask = (1 << (8 - step)) - 1;
    }

    float v;
    if (colorMode == 0) {
        // Mono: same operation across all channels
        v = bitOp(x, y, operation, animMask);
        fragColor = vec4(v, v, v, 1.0);
    } else if (colorMode == 1) {
        // RGB: channel-shifted patterns (chromatic aberration)
        float r = bitOp(x, y, operation, animMask);
        float g = bitOp(x + colorOffset, y, operation, animMask);
        float b = bitOp(x, y + colorOffset, operation, animMask);
        fragColor = vec4(r, g, b, 1.0);
    } else {
        // HSV: bitwise value drives hue, full saturation and value
        // Scale hue to avoid wrapping both ends to red
        v = bitOp(x, y, operation, animMask);
        float hueScale = float(animMask) / float(animMask + 1);
        fragColor = vec4(hsv2rgb(vec3(v * hueScale, 1.0, 1.0)), 1.0);
    }
}
