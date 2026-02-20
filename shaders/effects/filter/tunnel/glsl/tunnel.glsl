/*
 * Perspective tunnel effect
 * Based on Inigo Quilez's tunnel shader
 * MIT License
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float time;
uniform int shape;
uniform float speed;
uniform float tunnelRotation;
uniform float tunnelScale;
uniform bool aspectLens;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float polygonShape(vec2 uv, int sides) {
    float a = atan(uv.x, uv.y) + PI;
    float r = TAU / float(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(uv);
}

vec2 smod(vec2 v, float m) {
    return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    
    // Center the coordinates
    vec2 centered = uv - 0.5;

    // Optional aspect ratio correction
    float aspectRatio = float(texSize.x) / float(texSize.y);
    if (aspectLens) { centered.x *= aspectRatio; }
    
    float a = atan(centered.y, centered.x);
    float r;
    
    if (shape == 0) {
        // Circle
        r = length(centered);
    } else if (shape == 1) {
        // Triangle
        r = polygonShape(centered * 2.0, 3);
    } else if (shape == 2) {
        // Square
        r = polygonShape(centered * 2.0, 4);
    } else if (shape == 3) {
        // Hexagon
        r = polygonShape(centered * 2.0, 6);
    } else {
        // Octagon
        r = polygonShape(centered * 2.0, 8);
    }
    
    // Apply scale
    r -= tunnelScale * 0.075;
    
    // Create tunnel coordinates
    vec2 tunnelCoords = smod(vec2(
        0.3 / r + time * speed,
        a / PI + time * -tunnelRotation
    ), 1.0);
    
    // Sample with gradient for proper filtering
    vec2 coordsForGrad = vec2(tunnelCoords.x, atan(tunnelCoords.y, abs(tunnelCoords.x)) / PI);
    fragColor = textureGrad(inputTex, tunnelCoords, dFdx(coordsForGrad), dFdy(coordsForGrad));
}
