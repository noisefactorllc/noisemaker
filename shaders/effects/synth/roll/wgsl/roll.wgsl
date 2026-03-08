@group(0) @binding(0) var feedbackSampler: sampler;
@group(0) @binding(1) var feedbackTex: texture_2d<f32>;
@group(0) @binding(2) var noteGridSampler: sampler;
@group(0) @binding(3) var noteGridTex: texture_2d<f32>;

struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    deltaTime: f32,
    lineColor: vec3<f32>,
    gain: f32,
    speed: f32,
    midiClockCount: f32,
};
@group(1) @binding(0) var<uniform> u: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = pos.xy / u.resolution;

    // Scroll feedback right (notes enter at left)
    // Clamp UV to valid range — sampler clamp-to-edge handles out-of-bounds
    let scrollAmount = u.speed * u.deltaTime * 0.5;
    let scrollUv = vec2<f32>(max(uv.x - scrollAmount, 0.0), uv.y);
    var prev = textureSample(feedbackTex, feedbackSampler, scrollUv) * 0.997;
    // Zero out if we scrolled past the left edge
    prev *= step(0.0, uv.x - scrollAmount);

    // 16 MIDI channels as horizontal swim lanes
    let laneF = uv.y * 16.0;
    let channel = i32(floor(laneF));
    let laneLocal = fract(laneF);

    // Each lane maps to MIDI keys 36-84 (C2-C6, 4 octaves)
    let keyLow = 36;
    let keyRange = 48;
    let keyExact = f32(keyLow) + laneLocal * f32(keyRange);
    let key = i32(floor(keyExact));

    // Sample note grid with fixed spread for visibility
    var maxVel = 0.0;
    for (var dk = -2; dk <= 2; dk++) {
        let k = clamp(key + dk, 0, 127);
        let gridUv = vec2<f32>((f32(k) + 0.5) / 128.0, (f32(channel) + 0.5) / 16.0);
        let noteData = textureSample(noteGridTex, noteGridSampler, gridUv);
        if (noteData.g > 0.5) {
            maxVel = max(maxVel, noteData.r);
        }
    }

    // Write new note data at the left edge
    let edgeWidth = 4.0 / u.resolution.x;
    var noteVal = 0.0;
    if (uv.x < edgeWidth && maxVel > 0.0) {
        noteVal = maxVel * u.gain;
    }

    // Lane separator lines
    var laneSep = 0.0;
    let laneEdge = fract(uv.y * 16.0);
    if (laneEdge < 0.02 || laneEdge > 0.98) {
        laneSep = 0.2;
    }

    let prevBright = max(prev.r, max(prev.g, prev.b));
    let brightness = max(prevBright, max(noteVal, laneSep));
    let col = u.lineColor * brightness;

    return vec4<f32>(col, 1.0);
}
