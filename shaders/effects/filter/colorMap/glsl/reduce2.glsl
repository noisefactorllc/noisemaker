#version 300 es
precision highp float;

uniform sampler2D reduceTex1;

out vec4 fragColor;

void main() {
    if (gl_FragCoord.x >= 1.0 || gl_FragCoord.y >= 1.0) {
        fragColor = vec4(0.0);
        return;
    }
    
    float min_val = 1e30;
    float max_val = -1e30;
    
    for (int y = 0; y < 32; y++) {
        for (int x = 0; x < 32; x++) {
            vec4 val = texelFetch(reduceTex1, ivec2(x, y), 0);
            min_val = min(min_val, val.r);
            max_val = max(max_val, val.g);
        }
    }
    
    if (min_val > max_val) {
        min_val = 0.0;
        max_val = 0.0;
    }
    
    fragColor = vec4(min_val, max_val, 0.0, 1.0);
}
