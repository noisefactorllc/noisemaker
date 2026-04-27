#version 300 es
precision highp float;

// Preview mesh data as a visualization
// Renders positions/normals as colors for debugging

uniform vec2 resolution;
uniform sampler2D positionsTex;
uniform sampler2D normalsTex;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    
    // Sample mesh data using texture() for proper UV sampling
    // The mesh textures are smaller than output, so use UV coordinates
    vec4 pos = texture(positionsTex, uv);
    vec4 normal = texture(normalsTex, uv);
    
    // Visualize: left half shows positions, right half shows normals
    vec3 color;
    if (uv.x < 0.5) {
        // Position visualization: map -1..1 to 0..1
        color = pos.xyz * 0.5 + 0.5;
    } else {
        // Normal visualization: map -1..1 to 0..1
        color = normal.xyz * 0.5 + 0.5;
    }
    
    // Check if this is a valid vertex (w > 0 in position means valid vertex ID)
    float alpha = 1.0;
    
    fragColor = vec4(color, alpha);
}
