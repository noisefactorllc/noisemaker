#version 300 es
precision highp float;
precision highp int;
uniform sampler2D tilesTex;
uniform int shapeMode;
uniform float aperture;
uniform int viewMode;
out vec4 fragColor;

void main() {
    if (shapeMode != 0 || aperture <= 0.0 || viewMode == 0) { fragColor = vec4(0.0); return; }
    ivec2 origin = ivec2(gl_FragCoord.xy) * 32;
    vec4 total = vec4(0.0);
    for (int y = 0; y < 32; y++) {
        for (int x = 0; x < 32; x++) {
            total += texelFetch(tilesTex, origin + ivec2(x, y), 0);
        }
    }
    fragColor = total;
}
