#version 300 es
precision highp float;

uniform sampler2D tex;
uniform sampler2D trailTex;
uniform float inputIntensity;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(trailTex, 0));
    
    vec4 input_color = texture(tex, uv);
    vec4 trail_color = texture(trailTex, uv);
    
    float inputMix = inputIntensity * 0.01;
    
    fragColor = mix(trail_color, input_color, inputMix);
    fragColor.a = 1.0;
}
