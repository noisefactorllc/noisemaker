#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float angled;
uniform float time;
uniform bool darkest;
uniform float wrap;

out vec4 fragColor;

const float PI = 3.141592653589793;

vec2 applyWrap(vec2 coord, vec2 size) {
    vec2 uv = coord / size;
    int mode = int(wrap);
    if (mode == 0) {
        uv = abs(mod(uv + 1.0, 2.0) - 1.0);  // mirror
    } else if (mode == 1) {
        uv = fract(uv);  // repeat
    } else {
        uv = clamp(uv, 0.0, 1.0);  // clamp
    }
    return uv;
}

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
    
    vec2 wrappedUV = applyWrap(srcCoord, texSize);
    vec4 color = texture(inputTex, wrappedUV);
    
    if (darkest) {
        color = vec4(1.0) - color;
    }
    
    fragColor = color;
}
