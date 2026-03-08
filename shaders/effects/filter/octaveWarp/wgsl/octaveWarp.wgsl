/*
 * Octave Warp - per-octave noise warp distortion
 * For each octave i, generates noise at frequency×2^i, uses it to
 * displace UV coordinates, samples input at displaced position.
 * Displacement decreases with each octave (displacement / 2^i).
 */

struct Uniforms {
    frequency: f32,
    octaves: f32,
    displacement: f32,
    speed: f32,
    splineOrder: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> time: f32;

const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717959;

fn hash21(p: vec2<f32>) -> f32 {
    let h = dot(p, vec2<f32>(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let ff = f * f * (3.0 - 2.0 * f);

    let a = hash21(i);
    let b = hash21(i + vec2<f32>(1.0, 0.0));
    let c = hash21(i + vec2<f32>(0.0, 1.0));
    let d = hash21(i + vec2<f32>(1.0, 1.0));

    return mix(mix(a, b, ff.x), mix(c, d, ff.x), ff.y);
}

fn simplexNoise(p: vec2<f32>, t: f32) -> f32 {
    var n = noise(p + t * 0.1);
    n = n + noise(p * 2.0 - t * 0.15) * 0.5;
    n = n + noise(p * 4.0 + t * 0.2) * 0.25;
    return n / 1.75;
}

fn wrapFloat(value: f32, limit: f32) -> f32 {
    if (limit <= 0.0) {
        return 0.0;
    }
    var result = value - floor(value / limit) * limit;
    if (result < 0.0) {
        result = result + limit;
    }
    return result;
}

fn applySpline(value: f32, order: i32) -> f32 {
    let clamped = clamp(value, 0.0, 1.0);
    if (order == 2) {
        return 0.5 - cos(clamped * PI) * 0.5;
    }
    return clamped;
}

fn wrapCoord(coord: i32, limit: i32) -> i32 {
    if (limit <= 0) {
        return 0;
    }
    var wrapped = coord % limit;
    if (wrapped < 0) {
        wrapped = wrapped + limit;
    }
    return wrapped;
}

fn sampleNearest(coord: vec2<f32>, w: i32, h: i32) -> vec4<f32> {
    let x = wrapCoord(i32(round(coord.x)), w);
    let y = wrapCoord(i32(round(coord.y)), h);
    return textureLoad(inputTex, vec2<i32>(x, y), 0);
}

fn sampleBilinear(coord: vec2<f32>, w: i32, h: i32, order: i32) -> vec4<f32> {
    var x0 = i32(floor(coord.x));
    var y0 = i32(floor(coord.y));
    if (x0 < 0) { x0 = 0; } else if (x0 >= w) { x0 = w - 1; }
    if (y0 < 0) { y0 = 0; } else if (y0 >= h) { y0 = h - 1; }

    let x1 = wrapCoord(x0 + 1, w);
    let y1 = wrapCoord(y0 + 1, h);

    let fx = applySpline(clamp(coord.x - f32(x0), 0.0, 1.0), order);
    let fy = applySpline(clamp(coord.y - f32(y0), 0.0, 1.0), order);

    let tex00 = textureLoad(inputTex, vec2<i32>(x0, y0), 0);
    let tex10 = textureLoad(inputTex, vec2<i32>(x1, y0), 0);
    let tex01 = textureLoad(inputTex, vec2<i32>(x0, y1), 0);
    let tex11 = textureLoad(inputTex, vec2<i32>(x1, y1), 0);

    let mixX0 = mix(tex00, tex10, vec4<f32>(fx));
    let mixX1 = mix(tex01, tex11, vec4<f32>(fx));
    return mix(mixX0, mixX1, vec4<f32>(fy));
}

fn cubicInterp(a: vec4<f32>, b: vec4<f32>, c: vec4<f32>, d: vec4<f32>, t: f32) -> vec4<f32> {
    let t2 = t * t;
    let t3 = t2 * t;
    let a0 = d - c - a + b;
    let a1 = a - b - a0;
    let a2 = c - a;
    return a0 * t3 + a1 * t2 + a2 * t + b;
}

fn sampleBicubic(coord: vec2<f32>, w: i32, h: i32) -> vec4<f32> {
    let bx = i32(floor(coord.x));
    let by = i32(floor(coord.y));
    let fx = coord.x - floor(coord.x);
    let fy = coord.y - floor(coord.y);

    // Row m=-1
    let r0_0 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx - 1, w), wrapCoord(by - 1, h)), 0);
    let r0_1 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx, w), wrapCoord(by - 1, h)), 0);
    let r0_2 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx + 1, w), wrapCoord(by - 1, h)), 0);
    let r0_3 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx + 2, w), wrapCoord(by - 1, h)), 0);
    let col0 = cubicInterp(r0_0, r0_1, r0_2, r0_3, fx);

    // Row m=0
    let r1_0 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx - 1, w), wrapCoord(by, h)), 0);
    let r1_1 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx, w), wrapCoord(by, h)), 0);
    let r1_2 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx + 1, w), wrapCoord(by, h)), 0);
    let r1_3 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx + 2, w), wrapCoord(by, h)), 0);
    let col1 = cubicInterp(r1_0, r1_1, r1_2, r1_3, fx);

    // Row m=1
    let r2_0 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx - 1, w), wrapCoord(by + 1, h)), 0);
    let r2_1 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx, w), wrapCoord(by + 1, h)), 0);
    let r2_2 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx + 1, w), wrapCoord(by + 1, h)), 0);
    let r2_3 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx + 2, w), wrapCoord(by + 2, h)), 0);
    let col2 = cubicInterp(r2_0, r2_1, r2_2, r2_3, fx);

    // Row m=2
    let r3_0 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx - 1, w), wrapCoord(by + 2, h)), 0);
    let r3_1 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx, w), wrapCoord(by + 2, h)), 0);
    let r3_2 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx + 1, w), wrapCoord(by + 2, h)), 0);
    let r3_3 = textureLoad(inputTex, vec2<i32>(wrapCoord(bx + 2, w), wrapCoord(by + 2, h)), 0);
    let col3 = cubicInterp(r3_0, r3_1, r3_2, r3_3, fx);

    return cubicInterp(col0, col1, col2, col3, fy);
}

fn sampleWithOrder(coord: vec2<f32>, w: i32, h: i32, order: i32) -> vec4<f32> {
    let wf = f32(w);
    let hf = f32(h);
    let wrapped = vec2<f32>(
        wrapFloat(coord.x, wf),
        wrapFloat(coord.y, hf),
    );
    if (order <= 0) {
        return sampleNearest(wrapped, w, h);
    }
    if (order >= 3) {
        return sampleBicubic(wrapped, w, h);
    }
    return sampleBilinear(wrapped, w, h, order);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let width = texSize.x;
    let height = texSize.y;

    // Adjust frequency for aspect ratio
    var freq = vec2<f32>(uniforms.frequency);
    if (width > height && height > 0.0) {
        freq.y = uniforms.frequency * width / height;
    } else if (height > width && width > 0.0) {
        freq.x = uniforms.frequency * height / width;
    }

    let uv = pos.xy / texSize;
    var sampleCoord = uv * texSize;

    let numOctaves = max(i32(uniforms.octaves), 1);
    let displaceBase = uniforms.displacement;

    // Per-octave warping
    for (var octave: i32 = 1; octave <= 10; octave = octave + 1) {
        if (octave > numOctaves) {
            break;
        }

        let multiplier = pow(2.0, f32(octave));
        let freqScaled = freq * 0.5 * multiplier;

        if (freqScaled.x >= width || freqScaled.y >= height) {
            break;
        }

        // Compute reference angles from noise
        let noiseCoord = (sampleCoord / texSize) * freqScaled;
        let refX = simplexNoise(noiseCoord + vec2<f32>(17.0, 29.0), time * uniforms.speed) * 2.0 - 1.0;
        let refY = simplexNoise(noiseCoord + vec2<f32>(23.0, 31.0), time * uniforms.speed) * 2.0 - 1.0;

        // Calculate displacement (decreases with each octave)
        let displaceScale = displaceBase / multiplier;
        let offset = vec2<f32>(refX * displaceScale * width, refY * displaceScale * height);

        sampleCoord = sampleCoord + offset;
        sampleCoord = vec2<f32>(
            wrapFloat(sampleCoord.x, width),
            wrapFloat(sampleCoord.y, height),
        );
    }

    let sampled = sampleWithOrder(sampleCoord, i32(width), i32(height), i32(uniforms.splineOrder));
    return sampled;
}
