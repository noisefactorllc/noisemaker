// Voronoi diagram effect - simplified version for WebGPU
// Matches GLSL implementation

const PI : f32 = 3.14159265358979;
const TAU : f32 = 6.28318530717959;

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<uniform> alpha : f32;
@group(0) @binding(2) var<uniform> pointFreq : f32;
@group(0) @binding(3) var<uniform> nth : f32;
@group(0) @binding(4) var<uniform> shape : f32;

// Hash function
fn hash21(p : vec2<f32>) -> f32 {
    let h = dot(p, vec2<f32>(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

fn hash22(p : vec2<f32>) -> vec2<f32> {
    let p2 = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)), dot(p, vec2<f32>(269.5, 183.3)));
    return fract(sin(p2) * 43758.5453123);
}

// Distance metrics
fn distanceMetric(a : vec2<f32>, b : vec2<f32>, metric : i32) -> f32 {
    let d = a - b;
    if (metric == 1) {
        // Manhattan
        return abs(d.x) + abs(d.y);
    } else if (metric == 2) {
        // Chebyshev
        return max(abs(d.x), abs(d.y));
    } else {
        // Euclidean
        return length(d);
    }
}

// Get cell point with animation
fn getCellPoint(cell : vec2<f32>) -> vec2<f32> {
    let random = hash22(cell);
    return cell + 0.5 + random * 0.3;
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = position.xy / dims;
    let src = textureLoad(inputTex, vec2<i32>(position.xy), 0);
    
    let freq = max(i32(pointFreq), 2);
    let metric = i32(shape);
    let nthPoint = max(i32(nth), 1);
    
    // Scale coordinates to grid
    let coord = uv * f32(freq);
    let baseCell = floor(coord);
    
    // Find distances to nearby points - use array
    var distances : array<f32, 9>;
    var count = 0;
    
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let cell = baseCell + vec2<f32>(f32(dx), f32(dy));
            let point = getCellPoint(cell);
            let d = distanceMetric(coord, point, metric);
            distances[count] = d;
            count++;
        }
    }
    
    // Sort to find nth closest (simple bubble sort)
    for (var i = 0; i < 8; i++) {
        for (var j = i + 1; j < 9; j++) {
            if (distances[j] < distances[i]) {
                let tmp = distances[i];
                distances[i] = distances[j];
                distances[j] = tmp;
            }
        }
    }
    
    // Get nth distance (0-indexed, so nth=1 means closest)
    let idx = min(nthPoint - 1, 8);
    let d = distances[idx];
    
    // Normalize to 0-1 range
    let maxDist = sqrt(2.0);
    let val = clamp(d / maxDist, 0.0, 1.0);
    
    // Mix with source
    let voronoiColor = vec3<f32>(val);
    let result = mix(src.rgb, voronoiColor, alpha);
    
    return vec4<f32>(result, src.a);
}
