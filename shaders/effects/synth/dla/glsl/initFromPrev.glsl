#version 300 es

precision highp float;

uniform sampler2D gridTex;
uniform vec2 resolution;
uniform int frame;
uniform float decay;
uniform bool resetState;

layout(location = 0) out vec4 dlaOutColor;

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    // If resetState is true, clear the trail
    if (resetState) {
        dlaOutColor = vec4(0.0);
        return;
    }
    
    vec2 uv = gl_FragCoord.xy / resolution;
    
    // Direct sample - no blur
    float prev = texture(gridTex, uv).a;

    // Apply decay to simulation grid (chemistry)
    // decay=0 means full persistence, higher decay = faster fade
    float persistence = clamp(1.0 - decay, 0.0, 1.0);
    float energy = prev * persistence;
    
    // Cap energy to prevent runaway accumulation
    energy = min(energy, 6.0);

    // Seed logic for first frame only
    if (frame <= 1) {
        float rng = hash21(gl_FragCoord.xy + float(frame) * 17.0);
        float radial = smoothstep(0.18, 0.02, length(uv - 0.5));
        float seedDensity = 0.005;
        float densityScale = clamp(seedDensity * 900.0, 0.0, 0.98);
        float seedWeight = step(1.0 - densityScale, rng) * radial;
        if (seedWeight > 0.0) {
            float strength = mix(0.25, 0.85, seedWeight);
            energy = max(energy, strength);
        }
    }

    dlaOutColor = vec4(energy, energy, energy, energy);
}
