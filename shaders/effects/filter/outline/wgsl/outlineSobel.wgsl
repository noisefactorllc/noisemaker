// Outline Sobel pass - edge detection with configurable metric

struct Params {
    sobelMetric : f32,
    _pad0 : f32,
    _pad1 : f32,
    _pad2 : f32,
}

@group(0) @binding(0) var valueTexture : texture_2d<f32>;
@group(0) @binding(1) var<uniform> params : Params;

fn wrapCoord(value : i32, size : i32) -> i32 {
    if (size <= 0) {
        return 0;
    }
    var wrapped = value % size;
    if (wrapped < 0) {
        wrapped = wrapped + size;
    }
    return wrapped;
}

fn distanceMetric(gx : f32, gy : f32, metric : i32) -> f32 {
    let abs_gx = abs(gx);
    let abs_gy = abs(gy);
    
    if (metric == 2) {
        // Manhattan
        return abs_gx + abs_gy;
    } else if (metric == 3) {
        // Chebyshev
        return max(abs_gx, abs_gy);
    } else if (metric == 4) {
        // Octagram
        let cross = (abs_gx + abs_gy) / 1.414;
        return max(cross, max(abs_gx, abs_gy));
    } else {
        // Euclidean (default)
        return sqrt(gx * gx + gy * gy);
    }
}

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) texCoord : vec2<f32>,
}

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let dimensions = vec2<i32>(textureDimensions(valueTexture));
    if (dimensions.x == 0 || dimensions.y == 0) {
        return vec4<f32>(0.0);
    }

    let coord = vec2<i32>(input.position.xy);
    let metric = i32(params.sobelMetric);

    // Sample 3x3 neighborhood
    var samples : array<f32, 9>;
    var idx = 0;
    for (var ky = -1; ky <= 1; ky = ky + 1) {
        for (var kx = -1; kx <= 1; kx = kx + 1) {
            let sampleX = wrapCoord(coord.x + kx, dimensions.x);
            let sampleY = wrapCoord(coord.y + ky, dimensions.y);
            samples[idx] = textureLoad(valueTexture, vec2<i32>(sampleX, sampleY), 0).r;
            idx = idx + 1;
        }
    }

    // Sobel X kernel: [-1 0 1; -2 0 2; -1 0 1]
    let gx = -samples[0] + samples[2] - 2.0*samples[3] + 2.0*samples[5] - samples[6] + samples[8];
    
    // Sobel Y kernel: [-1 -2 -1; 0 0 0; 1 2 1]
    let gy = -samples[0] - 2.0*samples[1] - samples[2] + samples[6] + 2.0*samples[7] + samples[8];

    let magnitude = distanceMetric(gx, gy, metric);
    // Boost edge visibility - multiply by 4 to make edges more visible
    let normalized = clamp(magnitude * 4.0, 0.0, 1.0);
    
    return vec4<f32>(normalized, normalized, normalized, 1.0);
}
