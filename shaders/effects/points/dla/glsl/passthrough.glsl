#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D gridTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float matteOpacity;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 inputCol = texture(inputTex, uv);
    vec4 grid = texture(gridTex, uv);
    
    // Blend grid structure over input
    // Grid alpha indicates structure presence
    float gridStrength = clamp(grid.a, 0.0, 1.0);
    vec3 gridColor = grid.rgb;
    float matteAlpha = matteOpacity;
    
    // Mix: where grid exists, show grid color; otherwise show input (premultiplied by matte)
    vec3 color = mix(inputCol.rgb * matteAlpha, gridColor, gridStrength);
    
    // Alpha: where grid exists, full opacity; elsewhere, matte opacity
    float alpha = max(gridStrength, matteAlpha);
    
    fragColor = vec4(color, alpha);
}
