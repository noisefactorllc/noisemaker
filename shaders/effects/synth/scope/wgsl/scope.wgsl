// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> audioWaveform: array<vec4<f32>, 32>;
@group(0) @binding(2) var<uniform> lineColor: vec3<f32>;
@group(0) @binding(3) var<uniform> lineThickness: f32;
@group(0) @binding(4) var<uniform> gain: f32;

fn sampleWaveform(index: u32) -> f32 {
    return audioWaveform[index / 4u][index % 4u];
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = vec2<f32>(position.x, resolution.y - position.y) / resolution;

    // Sample the waveform at this x position
    // Map uv.x [0,1] to array index [0,127]
    let fIndex = uv.x * 127.0;
    let i0 = u32(floor(fIndex));
    let i1 = min(i0 + 1u, 127u);
    let fract_i = fract(fIndex);

    // Linearly interpolate between adjacent samples
    let s0 = sampleWaveform(i0);
    let s1 = sampleWaveform(i1);
    let wval = mix(s0, s1, fract_i);

    // Apply gain around center (0.5 = silence)
    let gained = 0.5 + (wval - 0.5) * gain;

    // Distance from fragment to waveform line, in pixels
    let dist = abs(uv.y - gained) * resolution.y;

    // Anti-aliased line
    let line = smoothstep(lineThickness + 1.0, lineThickness, dist);

    // Premultiplied alpha output
    return vec4<f32>(lineColor * line, line);
}
