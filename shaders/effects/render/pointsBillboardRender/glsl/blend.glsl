#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D trailTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float inputIntensity;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 inputColor = texture(inputTex, uv);
    vec4 trailColor = texture(trailTex, uv);
    
    // Blend: trail over scaled input using alpha
    // inputIntensity 0 = trail only, 100 = trail over full input
    float t = inputIntensity / 100.0;
    vec4 scaledInput = inputColor * t;
    
    // Alpha compositing: trail over input
    float outAlpha = trailColor.a + scaledInput.a * (1.0 - trailColor.a);
    vec3 outRGB = outAlpha > 0.0 
        ? (trailColor.rgb * trailColor.a + scaledInput.rgb * scaledInput.a * (1.0 - trailColor.a)) / outAlpha
        : vec3(0.0);
    
    fragColor = vec4(outRGB, outAlpha);
}
