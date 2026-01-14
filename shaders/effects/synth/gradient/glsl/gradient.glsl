#version 300 es
precision highp float;

/*
 * Gradient generator shader.
 * Renders linear, radial, conic, and four corners gradients with rotation and repeat.
 */

uniform vec2 resolution;
uniform int gradientType;
uniform float rotation;
uniform int repeatCount;
uniform vec4 color1;
uniform vec4 color2;
uniform vec4 color3;
uniform vec4 color4;

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
vec4 blend4Colors(float t) {
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

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    float aspectRatio = resolution.x / resolution.y;
    
    // Convert rotation from degrees to radians
    float angle = rotation * PI / 180.0;
    
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
    
    vec4 color;
    float t;
    
    if (gradientType == 0) {
        // Linear gradient along rotated y-axis
        t = rotatedSt.y;
        t = fract(t * float(repeatCount));
        color = blend4Colors(t);
    } else if (gradientType == 1) {
        // Radial gradient from center
        float dist = length(centered) * 2.0; // Scale so edge is roughly 1
        
        // Apply rotation to the radial gradient by rotating the sample point
        vec2 rotatedPoint = mat2(c, -s, s, c) * centered;
        dist = length(rotatedPoint) * 2.0;
        
        t = dist;
        t = fract(t * float(repeatCount));
        color = blend4Colors(t);
    } else if (gradientType == 2) {
        // Conic/angular gradient
        float a = atan(rotatedCentered.y, rotatedCentered.x);
        t = (a + PI) / TAU; // Map from [-PI, PI] to [0, 1]
        t = fract(t * float(repeatCount));
        color = blend4Colors(t);
    } else if (gradientType == 3) {
        // Four corners - bilinear interpolation
        // Apply rotation to the sampling coordinates
        vec2 cornerSt = rotate2D(st, angle);
        
        // Bilinear interpolation between 4 corner colors
        vec4 top = mix(color1, color2, cornerSt.x);
        vec4 bottom = mix(color4, color3, cornerSt.x);
        color = mix(bottom, top, cornerSt.y);
    }
    
    // Premultiply alpha for correct compositing
    color.rgb *= color.a;
    
    fragColor = color;
}
