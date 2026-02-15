/*
 * Smooth - Blending Pass
 * MSAA mode: multi-sample supersampling with scalable radius
 * SMAA mode: morphological blending with improved edge-aware weights
 * Blur mode: edge-selective Gaussian blur
 */

struct Uniforms {
    data: array<vec4<f32>, 2>,
    // data[0].x = smoothType, data[0].y = smoothStrength, data[0].z = smoothThreshold, data[0].w = smoothSamples
    // data[1].x = smoothSearchSteps, data[1].y = smoothRadius
};

const LUMA_WEIGHTS: vec3<f32> = vec3<f32>(0.299, 0.587, 0.114);

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var edgeTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn luminance(rgb: vec3<f32>) -> f32 {
    return dot(rgb, LUMA_WEIGHTS);
}

// --- MSAA: rotated grid sample offsets ---

fn sampleOffset2x(i: i32) -> vec2<f32> {
    if (i == 0) { return vec2<f32>(-0.25, 0.25); }
    return vec2<f32>(0.25, -0.25);
}

fn sampleOffset4x(i: i32) -> vec2<f32> {
    if (i == 0) { return vec2<f32>(-0.125, -0.375); }
    if (i == 1) { return vec2<f32>( 0.375, -0.125); }
    if (i == 2) { return vec2<f32>(-0.375,  0.125); }
    return vec2<f32>( 0.125,  0.375);
}

fn sampleOffset8x(i: i32) -> vec2<f32> {
    if (i == 0) { return vec2<f32>(-0.375, -0.375); }
    if (i == 1) { return vec2<f32>( 0.125, -0.375); }
    if (i == 2) { return vec2<f32>(-0.125, -0.125); }
    if (i == 3) { return vec2<f32>( 0.375, -0.125); }
    if (i == 4) { return vec2<f32>(-0.375,  0.125); }
    if (i == 5) { return vec2<f32>( 0.125,  0.125); }
    if (i == 6) { return vec2<f32>(-0.125,  0.375); }
    return vec2<f32>( 0.375,  0.375);
}

fn getSampleOffset(i: i32, count: i32) -> vec2<f32> {
    if (count <= 2) { return sampleOffset2x(i); }
    if (count <= 4) { return sampleOffset4x(i); }
    return sampleOffset8x(i);
}

fn msaaBlend(uv: vec2<f32>, texelSize: vec2<f32>, threshold: f32, sampleCount: i32, radius: f32) -> vec4<f32> {
    let center = textureSample(inputTex, inputSampler, uv);

    // Threshold check: skip AA for low-contrast pixels
    let L = luminance(center.rgb);
    let Ln = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0, -texelSize.y)).rgb);
    let Ls = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0,  texelSize.y)).rgb);
    let Lw = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(-texelSize.x, 0.0)).rgb);
    let Le = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>( texelSize.x, 0.0)).rgb);

    let maxDiff = max(max(abs(L - Ln), abs(L - Ls)),
                      max(abs(L - Lw), abs(L - Le)));

    if (maxDiff < threshold) {
        return center;
    }

    // Supersample at radius-scaled offsets (WebGPU sampler provides bilinear filtering)
    var sum = vec4<f32>(0.0);
    for (var i = 0; i < 8; i = i + 1) {
        if (i >= sampleCount) { break; }
        let offset = getSampleOffset(i, sampleCount) * radius;
        sum = sum + textureSample(inputTex, inputSampler, uv + offset * texelSize);
    }
    return sum / f32(sampleCount);
}

// --- SMAA: morphological edge search and blending ---

fn searchEdge(coord: vec2<i32>, dir: vec2<i32>, maxCoord: vec2<i32>, component: i32, maxSteps: i32) -> f32 {
    for (var i = 1; i <= 32; i = i + 1) {
        if (i > maxSteps) { break; }
        let sampleCoord = clamp(coord + dir * i, vec2<i32>(0), maxCoord);
        var edge: f32;
        if (component == 0) {
            edge = textureLoad(edgeTex, sampleCoord, 0).r;
        } else {
            edge = textureLoad(edgeTex, sampleCoord, 0).g;
        }
        if (edge < 0.5) {
            return f32(i - 1);
        }
    }
    return f32(maxSteps);
}

fn smaaBlend(fragPos: vec2<f32>, searchSteps: i32, radius: f32) -> vec4<f32> {
    let size = vec2<i32>(textureDimensions(inputTex, 0));
    let coord = vec2<i32>(i32(fragPos.x), i32(fragPos.y));
    let maxCoord = size - vec2<i32>(1);

    let edges = textureLoad(edgeTex, coord, 0);
    let edgeH = edges.r;
    let edgeV = edges.g;

    let center = textureLoad(inputTex, coord, 0);
    if (edgeH < 0.5 && edgeV < 0.5) {
        return center;
    }

    var blended = center;

    // Horizontal edge: search left/right, blend with vertical neighbor
    if (edgeH > 0.5) {
        let distLeft  = searchEdge(coord, vec2<i32>(-1, 0), maxCoord, 0, searchSteps);
        let distRight = searchEdge(coord, vec2<i32>( 1, 0), maxCoord, 0, searchSteps);
        let edgeLength = distLeft + distRight + 1.0;

        // Stronger blend for shorter edges (more jaggy), scaled by radius
        let weight = clamp(radius * 0.5 / sqrt(edgeLength), 0.0, 0.5);

        let neighbor = textureLoad(inputTex, clamp(coord + vec2<i32>(0, 1), vec2<i32>(0), maxCoord), 0);
        blended = mix(blended, neighbor, weight);
    }

    // Vertical edge: search up/down, blend with horizontal neighbor
    if (edgeV > 0.5) {
        let distUp   = searchEdge(coord, vec2<i32>(0, -1), maxCoord, 1, searchSteps);
        let distDown = searchEdge(coord, vec2<i32>(0,  1), maxCoord, 1, searchSteps);
        let edgeLength = distUp + distDown + 1.0;

        let weight = clamp(radius * 0.5 / sqrt(edgeLength), 0.0, 0.5);

        let neighbor = textureLoad(inputTex, clamp(coord + vec2<i32>(1, 0), vec2<i32>(0), maxCoord), 0);
        blended = mix(blended, neighbor, weight);
    }

    return blended;
}

// --- Blur: edge-selective Gaussian ---

fn edgeBlur(fragPos: vec2<f32>, radius: f32) -> vec4<f32> {
    let size = vec2<i32>(textureDimensions(inputTex, 0));
    let coord = vec2<i32>(i32(fragPos.x), i32(fragPos.y));
    let maxCoord = size - vec2<i32>(1);

    let edges = textureLoad(edgeTex, coord, 0);
    let center = textureLoad(inputTex, coord, 0);

    if (edges.r < 0.5 && edges.g < 0.5) {
        return center;
    }

    let r = i32(ceil(radius));
    let sigma = radius * 0.5;
    let sigma2 = 2.0 * sigma * sigma;

    var sum = center;
    var totalWeight = 1.0;

    for (var dy = -4; dy <= 4; dy = dy + 1) {
        for (var dx = -4; dx <= 4; dx = dx + 1) {
            if (dx == 0 && dy == 0) { continue; }
            if (abs(dx) > r || abs(dy) > r) { continue; }

            let d = f32(dx * dx + dy * dy);
            let w = exp(-d / sigma2);

            sum = sum + textureLoad(inputTex, clamp(coord + vec2<i32>(dx, dy), vec2<i32>(0), maxCoord), 0) * w;
            totalWeight = totalWeight + w;
        }
    }

    return sum / totalWeight;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let smoothType = i32(uniforms.data[0].x);
    let smoothStrength = uniforms.data[0].y;
    let smoothThreshold = uniforms.data[0].z;
    let smoothSamples = i32(uniforms.data[0].w);
    let smoothSearchSteps = i32(uniforms.data[1].x);
    let smoothRadius = uniforms.data[1].y;

    let texSize = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = pos.xy / texSize;
    let texelSize = 1.0 / texSize;

    let original = textureSample(inputTex, inputSampler, uv);
    var result: vec4<f32>;

    if (smoothType == 0) {
        result = msaaBlend(uv, texelSize, smoothThreshold, smoothSamples, smoothRadius);
    } else if (smoothType == 1) {
        result = smaaBlend(pos.xy, smoothSearchSteps, smoothRadius);
    } else {
        result = edgeBlur(pos.xy, smoothRadius);
    }

    return mix(original, result, smoothStrength);
}
