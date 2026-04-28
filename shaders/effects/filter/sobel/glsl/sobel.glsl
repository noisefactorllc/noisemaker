/*
 * Sobel edge detection effect
 * Classic Sobel operator for edge detection
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float amount;
uniform float renderScale;
uniform float alpha;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texelSize = 1.0 / resolution;
    
    vec4 origColor = texture(inputTex, uv);
    
    // Sobel X kernel
    float sobel_x[9];
    sobel_x[0] = 1.0; sobel_x[1] = 0.0; sobel_x[2] = -1.0;
    sobel_x[3] = 2.0; sobel_x[4] = 0.0; sobel_x[5] = -2.0;
    sobel_x[6] = 1.0; sobel_x[7] = 0.0; sobel_x[8] = -1.0;
    
    // Sobel Y kernel
    float sobel_y[9];
    sobel_y[0] = 1.0;  sobel_y[1] = 2.0;  sobel_y[2] = 1.0;
    sobel_y[3] = 0.0;  sobel_y[4] = 0.0;  sobel_y[5] = 0.0;
    sobel_y[6] = -1.0; sobel_y[7] = -2.0; sobel_y[8] = -1.0;
    
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
    
    vec3 convX = vec3(0.0);
    vec3 convY = vec3(0.0);
    
    for (int i = 0; i < 9; i++) {
        vec3 texSample = texture(inputTex, uv + offsets[i] * amount * renderScale).rgb;
        convX += texSample * sobel_x[i];
        convY += texSample * sobel_y[i];
    }
    
    float dist = distance(convX, convY);
    
    // Multiply with original color
    vec3 result = origColor.rgb * dist;

    // Blend between original input and sobel result
    vec3 blended = mix(origColor.rgb, result, alpha);

    fragColor = vec4(blended, origColor.a);
}
