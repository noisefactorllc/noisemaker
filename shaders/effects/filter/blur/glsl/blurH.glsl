/*
 * Horizontal Gaussian blur pass
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float radiusX;
uniform float renderScale;

out vec4 fragColor;

const float PI = 3.14159265359;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec2 texelSize = 1.0 / vec2(texSize);

    int radius = int(radiusX * renderScale);
    if (radius <= 0) {
        fragColor = texture(inputTex, uv);
        return;
    }
    
    // Compute sigma for Gaussian (radius ~= 3*sigma)
    float sigma = float(radius) / 3.0;
    float sigma2 = sigma * sigma;
    
    vec4 sum = vec4(0.0);
    float weightSum = 0.0;
    
    for (int i = -radius; i <= radius; i++) {
        float x = float(i);
        float weight = exp(-(x * x) / (2.0 * sigma2));
        vec2 offset = vec2(float(i) * texelSize.x, 0.0);
        sum += texture(inputTex, uv + offset) * weight;
        weightSum += weight;
    }
    
    fragColor = sum / weightSum;
}
