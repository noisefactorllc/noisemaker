// Wobble effect - offsets the entire frame using noise-driven jitter

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> speed: f32;
@group(0) @binding(3) var<uniform> range: f32;
@group(0) @binding(4) var<uniform> time: f32;

const TAU: f32 = 6.28318530717959;
const X_NOISE_SEED: vec3<f32> = vec3<f32>(17.0, 29.0, 11.0);
const Y_NOISE_SEED: vec3<f32> = vec3<f32>(41.0, 23.0, 7.0);

// Hash function for noise
fn hash31(p_in: vec3<f32>) -> f32 {
    var p = fract(p_in * 0.1031);
    p += dot(p, vec3<f32>(p.y, p.z, p.x) + 33.33);
    return fract((p.x + p.y) * p.z);
}

fn noise3d(p: vec3<f32>) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    let n000 = hash31(i);
    let n100 = hash31(i + vec3<f32>(1.0, 0.0, 0.0));
    let n010 = hash31(i + vec3<f32>(0.0, 1.0, 0.0));
    let n110 = hash31(i + vec3<f32>(1.0, 1.0, 0.0));
    let n001 = hash31(i + vec3<f32>(0.0, 0.0, 1.0));
    let n101 = hash31(i + vec3<f32>(1.0, 0.0, 1.0));
    let n011 = hash31(i + vec3<f32>(0.0, 1.0, 1.0));
    let n111 = hash31(i + vec3<f32>(1.0, 1.0, 1.0));

    let x0 = mix(n000, n100, f.x);
    let x1 = mix(n010, n110, f.x);
    let x2 = mix(n001, n101, f.x);
    let x3 = mix(n011, n111, f.x);

    let y0 = mix(x0, x1, f.y);
    let y1 = mix(x2, x3, f.y);

    return mix(y0, y1, f.z);
}

fn simplexRandom(t: f32, spd: f32, seed: vec3<f32>) -> f32 {
    let angle = t * TAU;
    // Include speed in the noise coordinates so output varies with speed even at time=0
    let z = cos(angle) * spd + seed.x + spd * 0.317;
    let w = sin(angle) * spd + seed.y + spd * 0.519;
    let n = noise3d(vec3<f32>(z, w, seed.z + spd * 0.1));
    return clamp(n, 0.0, 1.0);
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Speed directly affects the noise sampling position
    // This ensures changing speed produces different noise values
    let spd = max(speed, 0.001);
    let r = clamp(range, 0.0, 1.0);

    // Compute jitter offsets - speed affects both the noise input and output scale
    let xRandom = simplexRandom(time + speed * 0.1, spd, X_NOISE_SEED);
    let yRandom = simplexRandom(time + speed * 0.1, spd, Y_NOISE_SEED);

    // Scale offset by range - controls displacement amount
    let offsetScale = r * (0.01 + speed * 0.02);
    let offset = (vec2<f32>(xRandom, yRandom) - 0.5) * offsetScale;

    // Apply offset to texture coordinate
    var sampleCoord = in.uv + offset;
    sampleCoord = fract(sampleCoord);  // Wrap around

    let sampled = textureSample(inputTex, u_sampler, sampleCoord);

    return sampled;
}
