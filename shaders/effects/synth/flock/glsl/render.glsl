#version 300 es
precision highp float;

uniform sampler2D trailTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float inputIntensity;
uniform int colorMode;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
    
    // Get trail color
    vec4 trailColor = texture(trailTex, uv);
    
    // Get input color if available
    float inputIntensityValue = inputIntensity / 100.0;
    vec4 baseColor = vec4(0.0);
    if (colorMode != 0) {
        vec4 baseSample = texture(tex, flippedUV);
        baseColor = vec4(baseSample.rgb * inputIntensityValue, baseSample.a);
    }
    
    // Combine trail and input
    vec3 combinedRgb = clamp(baseColor.rgb + trailColor.rgb, vec3(0.0), vec3(1.0));
    float finalAlpha = clamp(max(baseColor.a, trailColor.a), 0.0, 1.0);
    
    fragColor = vec4(combinedRgb, finalAlpha);
}
