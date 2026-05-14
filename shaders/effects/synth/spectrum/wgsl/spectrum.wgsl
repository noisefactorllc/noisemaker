// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> audioSpectrum: array<vec4<f32>, 32>;
@group(0) @binding(2) var<uniform> lineColor: vec3<f32>;
@group(0) @binding(3) var<uniform> lineThickness: f32;
@group(0) @binding(4) var<uniform> gain: f32;

fn sampleSpectrum(index: u32) -> f32 {
    return audioSpectrum[index / 4u][index % 4u];
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = vec2<f32>(position.x, resolution.y - position.y) / resolution;

    // Sample the spectrum at this x position
    let fIndex = uv.x * 127.0;
    let i0 = u32(floor(fIndex));
    let i1 = min(i0 + 1u, 127u);
    let fract_i = fract(fIndex);

    // Linearly interpolate between adjacent bins
    let s0 = sampleSpectrum(i0);
    let s1 = sampleSpectrum(i1);
    let mag = mix(s0, s1, fract_i) * gain;

    // Distance from fragment to spectrum curve, in pixels
    let dist = abs(uv.y - mag) * resolution.y;

    // Anti-aliased line
    let line = smoothstep(lineThickness + 1.0, lineThickness, dist);

    // Fill below the curve
    let fill = smoothstep(mag + 1.0 / resolution.y, mag, uv.y) * 0.15;

    let alpha = max(line, fill);
    return vec4<f32>(lineColor * alpha, alpha);
}
