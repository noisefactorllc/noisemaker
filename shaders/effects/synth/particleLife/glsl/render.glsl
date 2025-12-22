#version 300 es
precision highp float;

// Final Render Pass - Composite trails with optional input

uniform vec2 resolution;
uniform sampler2D trailTex;
uniform sampler2D tex;
uniform float inputIntensity;
uniform int colorMode;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    
    vec4 trail = texture(trailTex, uv);
    
    // Sample input texture if using color mode
    vec4 input_color = vec4(0.0);
    if (colorMode != 0) {
        vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
        input_color = texture(tex, flippedUV);
    }
    
    // Blend trail with input
    float inputWeight = inputIntensity * 0.01;
    vec3 color = trail.rgb + input_color.rgb * inputWeight;
    
    // Tone mapping for HDR trails
    color = color / (1.0 + color);
    
    fragColor = vec4(color, 1.0);
}
