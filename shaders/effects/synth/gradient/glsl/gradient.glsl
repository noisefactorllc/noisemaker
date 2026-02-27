#version 300 es
precision highp float;

/*
 * Gradient generator shader.
 * Renders linear, radial, conic, and four corners gradients with rotation and repeat.
 */

uniform vec2 resolution;
uniform int gradientType;
uniform float rotation;
uniform int repeat;
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 color3;
uniform vec3 color4;
uniform int seed;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

vec2 rotate2D(vec2 st, float angle) {
    float aspectRatio = resolution.x / resolution.y;
    st.x *= aspectRatio;
    st -= vec2(aspectRatio * 0.5, 0.5);
    float c = cos(angle);
    float s = sin(angle);
    st = mat2(c, -s, s, c) * st;
    st += vec2(aspectRatio * 0.5, 0.5);
    st.x /= aspectRatio;
    return st;
}

// Blend 4 colors based on a 0-1 parameter t, cycling through all 4
vec3 blend4Colors(float t) {
    t = fract(t); // Ensure t is in [0, 1]
    float segment = t * 4.0;
    int idx = int(floor(segment));
    float localT = fract(segment);
    
    if (idx == 0) {
        return mix(color1, color2, localT);
    } else if (idx == 1) {
        return mix(color2, color3, localT);
    } else if (idx == 2) {
        return mix(color3, color4, localT);
    } else {
        return mix(color4, color1, localT);
    }
}

// PCG PRNG for noise gradient
uvec3 pcg(uvec3 v) {
    v = v * uint(1664525) + uint(1013904223);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> uint(16);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 prng(vec3 p) {
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}

// Value noise using PCG
float hash2D(vec2 p) {
    return prng(vec3(p, float(seed))).x;
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash2D(i);
    float b = hash2D(i + vec2(1.0, 0.0));
    float c = hash2D(i + vec2(0.0, 1.0));
    float d = hash2D(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbmNoise(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    float maxVal = 0.0;
    for (int i = 0; i < 4; i++) {
        sum += valueNoise(p * freq) * amp;
        maxVal += amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    return sum / maxVal;
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    float aspectRatio = resolution.x / resolution.y;
    
    // Convert rotation from degrees to radians
    float angle = -rotation * PI / 180.0;
    
    // Apply rotation for linear and conic gradients
    vec2 rotatedSt = rotate2D(st, angle);
    
    // Centered coordinates for radial and conic
    vec2 centered = st - 0.5;
    centered.x *= aspectRatio;
    
    // Rotated centered for conic
    vec2 rotatedCentered = centered;
    float c = cos(angle);
    float s = sin(angle);
    rotatedCentered = mat2(c, -s, s, c) * centered;
    
    vec3 color;
    float t;
    
    if (gradientType == 0) {
        // Conic/angular gradient
        float a = atan(rotatedCentered.y, rotatedCentered.x);
        t = (a + PI) / TAU;
        t = fract(t * float(repeat));
        color = blend4Colors(t);
    } else if (gradientType == 1) {
        // Diamond gradient - L1 distance with rotation
        t = abs(rotatedCentered.x) + abs(rotatedCentered.y);
        t = fract(t * float(repeat));
        color = blend4Colors(t);
    } else if (gradientType == 2) {
        // Four corners - bilinear interpolation
        vec2 cornerSt = rotate2D(st, angle);
        vec3 top = mix(color1, color2, cornerSt.x);
        vec3 bottom = mix(color3, color4, cornerSt.x);
        color = mix(bottom, top, cornerSt.y);
    } else if (gradientType == 3) {
        // Linear gradient along rotated y-axis
        t = rotatedSt.y;
        t = fract(t * float(repeat));
        color = blend4Colors(t);
    } else if (gradientType == 4) {
        // Noise gradient with rotation
        vec2 noiseSt = rotatedCentered * 4.0;
        t = fbmNoise(noiseSt);
        t = fract(t * float(repeat));
        color = blend4Colors(t);
    } else if (gradientType == 5) {
        // Radial gradient from center
        vec2 rotatedPoint = mat2(c, -s, s, c) * centered;
        float dist = length(rotatedPoint) * 2.0;
        t = dist;
        t = fract(t * float(repeat));
        color = blend4Colors(t);
    } else if (gradientType == 6) {
        // Spiral gradient - angle + distance
        float a = atan(rotatedCentered.y, rotatedCentered.x);
        float dist = length(centered);
        t = fract(a / TAU + dist * 2.0);
        t = fract(t * float(repeat));
        color = blend4Colors(t);
    }

    fragColor = vec4(color, 1.0);
}
