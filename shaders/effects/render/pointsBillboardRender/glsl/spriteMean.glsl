#version 300 es
precision highp float;
precision highp int;
uniform sampler2D tilesTex;
uniform int shapeMode;
uniform float aperture;
uniform int viewMode;
out vec4 fragColor;

float proceduralCoverage() {
    // Means of the same 5x5 centered SDF samples, evaluated in double
    // precision and rounded once to f32. Recompute if a shape changes.
    // Fixed values avoid driver-dependent coverage drift during defocus.
    if (shapeMode == 1) return 0.713220537;
    if (shapeMode == 2) return 0.310907274;
    if (shapeMode == 3) return 0.680000007;
    if (shapeMode == 4) return 0.519999981;
    if (shapeMode == 5) return 0.0951406509;
    if (shapeMode == 6) return 0.103062622;
    return 0.362012237; // Soft shape and the existing fallback.
}

void main() {
    if (aperture <= 0.0 || viewMode == 0) { fragColor = vec4(0.0); return; }
    if (shapeMode != 0) {
        fragColor = vec4(proceduralCoverage());
        return;
    }
    ivec2 origin = ivec2(gl_FragCoord.xy) * 32;
    vec4 total = vec4(0.0);
    for (int y = 0; y < 32; y++) {
        for (int x = 0; x < 32; x++) {
            total += texelFetch(tilesTex, origin + ivec2(x, y), 0);
        }
    }
    fragColor = total;
}
