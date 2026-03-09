#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float angled;
uniform float time;
uniform bool darkest;

out vec4 fragColor;

const float PI = 3.141592653589793;

void main() {
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 center = texSize * 0.5;
    vec2 pixelCoord = gl_FragCoord.xy - center;
    
    float angle = angled;
    // Animation logic if needed
    
    float rad = angle * PI / 180.0;
    float c = cos(rad);
    float s = sin(rad);
    
    // Rotate
    vec2 srcCoord;
    srcCoord.x = c * pixelCoord.x + s * pixelCoord.y;
    srcCoord.y = -s * pixelCoord.x + c * pixelCoord.y;
    
    srcCoord += center;
    
    vec4 color;
    if (srcCoord.x < 0.0 || srcCoord.x >= texSize.x || srcCoord.y < 0.0 || srcCoord.y >= texSize.y) {
        color = vec4(0.0);
    } else {
        color = texture(inputTex, srcCoord / texSize);
    }
    
    if (darkest) {
        color = vec4(1.0) - color;
    }
    
    fragColor = color;
}
