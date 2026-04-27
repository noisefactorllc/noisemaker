#version 300 es
precision highp float;

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float audioWaveform[128];
uniform vec3 lineColor;
uniform float lineThickness;
uniform float gain;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = globalCoord / fullResolution;

    // Sample the waveform at this x position
    // Map uv.x [0,1] to array index [0,127]
    float fIndex = uv.x * 127.0;
    int i0 = int(floor(fIndex));
    int i1 = min(i0 + 1, 127);
    float fract_i = fract(fIndex);

    // Linearly interpolate between adjacent samples
    float s0 = audioWaveform[i0];
    float s1 = audioWaveform[i1];
    float wval = mix(s0, s1, fract_i);

    // Apply gain around center (0.5 = silence)
    wval = 0.5 + (wval - 0.5) * gain;

    // Distance from fragment to waveform line, in pixels
    float dist = abs(uv.y - wval) * fullResolution.y;

    // Anti-aliased line
    float line = smoothstep(lineThickness + 1.0, lineThickness, dist);

    // Premultiplied alpha output
    fragColor = vec4(lineColor * line, line);
}
