#version 300 es

precision highp float;
precision highp int;

uniform vec2 resolution;
uniform sampler2D bufTex;
uniform float time;
uniform float inputIntensity;
uniform sampler2D inputTex;

out vec4 fragColor;

vec3 sampleInputColor(vec2 uv) {
    vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
    return texture(inputTex, flippedUV).rgb;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float trail = texture(bufTex, uv).r;
    float tone = trail / (1.0 + trail);
    vec3 color = vec3(tone);
    
    // Blend input texture at output stage (like worms), not in feedback loop
    if (inputIntensity > 0.0) {
        float intensity = clamp(inputIntensity * 0.01, 0.0, 1.0);
        vec3 inputColor = sampleInputColor(uv);
        color = clamp(inputColor * intensity + color, 0.0, 1.0);
    }
    
    fragColor = vec4(color, 1.0);
}
