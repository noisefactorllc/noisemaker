/*
 * Convolution Feedback - Sharpen Pass
 * Applies unsharp mask with configurable radius
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform int sharpenRadius;
uniform float sharpenAmount;
uniform float renderScale;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    ivec2 coord = ivec2(gl_FragCoord.xy);

    vec4 center = texelFetch(inputTex, coord, 0);

    int scaledRadius = int(float(sharpenRadius) * renderScale);

    if (scaledRadius <= 0 || sharpenAmount <= 0.0) {
        fragColor = center;
        return;
    }

    // Compute Gaussian-weighted blur for unsharp mask
    float sigma = float(scaledRadius) / 2.0;
    float sigma2 = sigma * sigma;

    vec3 blurSum = vec3(0.0);
    float weightSum = 0.0;

    for (int ky = -scaledRadius; ky <= scaledRadius; ky++) {
        for (int kx = -scaledRadius; kx <= scaledRadius; kx++) {
            ivec2 samplePos = coord + ivec2(kx, ky);
            samplePos = clamp(samplePos, ivec2(0), texSize - 1);
            
            float dist2 = float(kx * kx + ky * ky);
            float weight = exp(-dist2 / (2.0 * sigma2));
            
            vec4 texSample = texelFetch(inputTex, samplePos, 0);
            blurSum += texSample.rgb * weight;
            weightSum += weight;
        }
    }
    
    vec3 blurred = blurSum / weightSum;
    
    // Unsharp mask: sharpened = original + amount * (original - blurred)
    vec3 sharpened = center.rgb + sharpenAmount * (center.rgb - blurred);
    sharpened = clamp(sharpened, 0.0, 1.0);
    
    fragColor = vec4(sharpened, center.a);
}
