#version 300 es
precision highp float;

// DLA - Initialize and decay anchor grid

uniform sampler2D gridTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int frame;
uniform float decay;
uniform float anchorDensity;
uniform bool resetState;

out vec4 fragColor;

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;
    
    // If resetState is true, clear the grid
    if (resetState) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Sample previous grid value
    vec4 prevGrid = texture(gridTex, uv);
    float prev = prevGrid.a;
    vec3 prevColor = prevGrid.rgb;
    
    // Apply decay (0 = full persistence, higher = faster fade)
    // decay range [0, 0.5] maps to persistence [1.0, 0.5]
    float persistence = 1.0 - decay;
    float energy = prev * persistence;
    vec3 color = prevColor * persistence;
    
    // Cap energy to prevent runaway accumulation
    energy = min(energy, 3.0);
    
    // Seed initial structure - always try, but only where grid is empty
    float rng = hash21(gl_FragCoord.xy);
    
    // Radial falloff from center - larger area for seeding
    float radial = smoothstep(0.25, 0.0, length(uv - 0.5));
    
    // Seed density controls threshold (higher = more seeds)
    // anchorDensity=1.0 → threshold=0.9 → 10% of radial pixels
    float seedThreshold = 1.0 - anchorDensity * 0.1;
    float seedWeight = step(seedThreshold, rng) * radial;
    
    // Only seed where there's no existing structure
    if (seedWeight > 0.0 && prev < 0.1) {
        float strength = mix(0.5, 1.0, rng);
        energy = max(energy, strength);
        color = vec3(strength);
    }
    
    fragColor = vec4(color, energy);
}
