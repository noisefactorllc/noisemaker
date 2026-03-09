#version 300 es
precision highp float;

uniform sampler2D inputTex; // sorted
uniform sampler2D originalTex; // original
uniform vec2 resolution;
uniform float angled;
uniform bool darkest;

out vec4 fragColor;

const float PI = 3.141592653589793;

void main() {
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 center = texSize * 0.5;
    vec2 pixelCoord = gl_FragCoord.xy - center;
    
    float angle = angled;
    float rad = angle * PI / 180.0;
    float c = cos(rad);
    float s = sin(rad);
    
    // Inverse Rotate
    vec2 srcCoord;
    srcCoord.x = c * pixelCoord.x - s * pixelCoord.y;
    srcCoord.y = s * pixelCoord.x + c * pixelCoord.y;
    
    srcCoord += center;
    
    vec4 originalColor = texture(originalTex, gl_FragCoord.xy / resolution);
    vec4 sortedColor;
    
    if (srcCoord.x < 0.0 || srcCoord.x >= texSize.x || srcCoord.y < 0.0 || srcCoord.y >= texSize.y) {
        sortedColor = originalColor;
    } else {
        sortedColor = texture(inputTex, srcCoord / texSize);
    }
    
    vec4 working_source = originalColor;
    vec4 working_sorted = sortedColor;
    
    if (darkest) {
        working_source = vec4(1.0) - working_source;
        working_sorted = vec4(1.0) - working_sorted;
    }
    
    vec4 blended = max(working_source, working_sorted);
    blended = clamp(blended, 0.0, 1.0);
    blended.a = working_source.a;
    
    if (darkest) {
        blended = vec4(1.0) - blended;
        blended.a = originalColor.a;
    } else {
        blended.a = originalColor.a;
    }
    
    fragColor = blended;
}
