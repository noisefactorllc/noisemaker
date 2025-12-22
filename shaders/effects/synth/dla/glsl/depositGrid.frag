#version 300 es
precision highp float;

// DLA - Deposit stuck agents to anchor grid (fragment shader)

uniform float deposit;

in float v_weight;
in vec3 v_color;

out vec4 fragColor;

void main() {
    // Discard if not a stuck agent
    if (v_weight < 0.5) {
        discard;
    }
    
    // Deposit energy with agent color
    // deposit range [0.5, 20] maps to energy [0.05, 2.0]
    float energy = deposit * 0.1;
    fragColor = vec4(v_color * energy, energy);
}
