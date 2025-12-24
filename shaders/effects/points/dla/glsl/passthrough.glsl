#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D gridTex;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 inputCol = texture(inputTex, uv);
    vec4 grid = texture(gridTex, uv);
    
    // Blend grid structure over input
    // Grid alpha indicates structure presence
    float gridStrength = clamp(grid.a, 0.0, 1.0);
    vec3 gridColor = grid.rgb;
    
    // Mix: where grid exists, show grid color; otherwise show input
    vec3 color = mix(inputCol.rgb, gridColor, gridStrength);
    fragColor = vec4(color, 1.0);
}
