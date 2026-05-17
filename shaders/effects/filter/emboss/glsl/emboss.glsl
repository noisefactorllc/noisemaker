/*
 * Emboss convolution effect
 * Creates a raised relief appearance
 */

#ifdef GL_ES
precision highp float;
#endif

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform float amount;
uniform float renderScale;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = globalCoord / fullResolution;
    vec2 texelSize = 1.0 / resolution;
    
    vec4 origColor = texture(inputTex, gl_FragCoord.xy / vec2(textureSize(inputTex, 0)));
    
    // Emboss kernel
    // -2 -1  0
    // -1  1  1
    //  0  1  2
    float kernel[9];
    kernel[0] = -2.0; kernel[1] = -1.0; kernel[2] = 0.0;
    kernel[3] = -1.0; kernel[4] = 1.0;  kernel[5] = 1.0;
    kernel[6] = 0.0;  kernel[7] = 1.0;  kernel[8] = 2.0;
    
    vec2 offsets[9];
    offsets[0] = vec2(-texelSize.x, -texelSize.y);
    offsets[1] = vec2(0.0, -texelSize.y);
    offsets[2] = vec2(texelSize.x, -texelSize.y);
    offsets[3] = vec2(-texelSize.x, 0.0);
    offsets[4] = vec2(0.0, 0.0);
    offsets[5] = vec2(texelSize.x, 0.0);
    offsets[6] = vec2(-texelSize.x, texelSize.y);
    offsets[7] = vec2(0.0, texelSize.y);
    offsets[8] = vec2(texelSize.x, texelSize.y);
    
    vec3 conv = vec3(0.0);
    
    for (int i = 0; i < 9; i++) {
        vec3 texSample = texture(inputTex, ((uv + offsets[i] * amount * renderScale) * fullResolution - tileOffset) / vec2(textureSize(inputTex, 0))).rgb;
        conv += texSample * kernel[i];
    }
    
    fragColor = vec4(clamp(conv, 0.0, 1.0), origColor.a);
}
