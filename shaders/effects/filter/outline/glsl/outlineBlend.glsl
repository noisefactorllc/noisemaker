#version 300 es

precision highp float;
precision highp int;

// Outline blend pass - darken base where edges are detected

uniform sampler2D inputTex;
uniform sampler2D edgesTexture;
uniform float invert;

out vec4 fragColor;

void main() {
    ivec2 dimensions = textureSize(inputTex, 0);
    if (dimensions.x == 0 || dimensions.y == 0) {
        fragColor = vec4(0.0);
        return;
    }

    vec2 uv = gl_FragCoord.xy / vec2(dimensions);
    
    vec4 base = texture(inputTex, uv);
    vec4 edges = texture(edgesTexture, uv);

    // Edge strength from luminance
    float strength = clamp(edges.r, 0.0, 1.0);
    
    // If inverted, flip the strength
    if (invert > 0.5) {
        strength = 1.0 - strength;
    }
    
    // Darken base where edges are present
    vec3 out_rgb = mix(base.rgb, vec3(0.0), strength);
    
    fragColor = vec4(out_rgb, base.a);
}
