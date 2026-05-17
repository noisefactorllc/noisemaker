#version 300 es
precision highp float;
precision highp int;

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform sampler2D statsTex;
out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(inputTex, coord, 0);
    
    // Read stats from the 1x1 texture
    vec4 stats = texelFetch(statsTex, ivec2(0, 0), 0);
    float minVal = stats.r;
    float maxVal = stats.g;
    
    // Avoid divide by zero
    if (maxVal - minVal < 0.00001) {
        fragColor = color;
        return;
    }
    
    vec3 normalized = (color.rgb - minVal) / (maxVal - minVal);
    fragColor = vec4(normalized, color.a);
}
