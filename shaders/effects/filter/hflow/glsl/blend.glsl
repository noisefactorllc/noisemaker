#version 300 es
precision highp float;
uniform sampler2D inputTex;
uniform sampler2D trailTex;
uniform vec2 resolution;
uniform float inputIntensity;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
    
    float inputIntensityValue = inputIntensity / 100.0;
    vec4 baseSample = texture(inputTex, flippedUV);
    vec4 baseColor = vec4(baseSample.rgb * inputIntensityValue, baseSample.a);
    
    vec4 trailColor = texture(trailTex, uv);
    
    vec3 combinedRgb = clamp(baseColor.rgb + trailColor.rgb, vec3(0.0), vec3(1.0));
    float finalAlpha = clamp(max(baseColor.a, trailColor.a), 0.0, 1.0);
    
    fragColor = vec4(combinedRgb, finalAlpha);
}
