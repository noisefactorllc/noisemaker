#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D trailTex;
uniform vec2 resolution;
uniform float inputIntensity;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    
    vec4 inputColor = texture(inputTex, uv);
    vec4 trailColor = texture(trailTex, uv);
    
    float inputFactor = inputIntensity / 100.0;
    
    // Blend trail over input
    vec3 result = mix(trailColor.rgb, inputColor.rgb, inputFactor);
    
    fragColor = vec4(result, 1.0);
}
